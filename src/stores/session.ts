import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  assertVaultRecord,
  createVault,
  CryptoError,
  openPayload,
  persistPayload,
  rewrapVaultPassword,
  unlockVault,
} from '@/features/crypto'
import { normalizeSettings } from '@/features/settings/validation'
import {
  assertMasterPin,
  markVaultAsPinProtected,
  vaultUsesMasterPin,
} from '@/features/security'
import { normalizeVaultPayload } from '@/features/vault'
import { LegacyVaultError, getDatabase } from '@/services/database'
import { setScreenProtection } from '@/services/platform/screenProtection'
import { applyTheme } from '@/services/platform/theme'
import { stopActiveScanner } from '@/services/scanner/QrScanner'
import {
  clearLegacyBiometricMaterial,
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometricStatus,
  unlockDekWithBiometrics,
  type BiometricStatus,
} from '@/services/secure/biometric'
import type {
  AppSettings,
  PortableSettings,
  VaultPayload,
  VaultRecord,
} from '@/types/domain'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'
import { clearSensitiveClipboard } from '@/utils/clipboard'

export type SessionStatus =
  | 'booting'
  | 'needs_setup'
  | 'legacy_reset_required'
  | 'locked'
  | 'unlocked'
  | 'fatal'

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('booting')
  const busy = ref(false)
  const errorMessage = ref<string | null>(null)
  const lastActiveAt = ref(Date.now())
  const record = shallowRef<VaultRecord | null>(null)
  const settings = ref<AppSettings>({ ...DEFAULT_APP_SETTINGS })
  const biometricStatus = ref<BiometricStatus>({
    available: false,
    enabled: false,
    reason: 'NOT_CHECKED',
  })

  /** Sensitive state: memory only while unlocked. */
  const dek = shallowRef<CryptoKey | null>(null)
  const payload = shallowRef<VaultPayload | null>(null)

  const isUnlocked = computed(() => status.value === 'unlocked')
  const hasVault = computed(() => record.value !== null)

  function touchActivity(): void {
    lastActiveAt.value = Date.now()
  }

  async function refreshBiometricStatus(): Promise<BiometricStatus> {
    try {
      biometricStatus.value = await getBiometricStatus()
    } catch {
      biometricStatus.value = { available: false, enabled: false, reason: 'CHECK_FAILED' }
    }
    return biometricStatus.value
  }

  async function bootstrap(): Promise<void> {
    busy.value = true
    errorMessage.value = null
    try {
      await clearLegacyBiometricMaterial()
      const db = await getDatabase()
      settings.value = normalizeSettings(await db.getSettings())
      applyTheme(settings.value.theme)
      await setScreenProtection(false).catch(() => undefined)
      const stored = await db.getVaultRecord()
      if (stored) assertVaultRecord(stored)
      record.value = stored
      status.value = stored ? 'locked' : 'needs_setup'
      await refreshBiometricStatus()
    } catch (error) {
      if (
        error instanceof LegacyVaultError ||
        (error instanceof CryptoError && error.code === 'UNSUPPORTED_VERSION')
      ) {
        status.value = 'legacy_reset_required'
        errorMessage.value = '检测到旧版开发数据，需要清空后重新创建保险箱。'
      } else {
        status.value = 'fatal'
        errorMessage.value = error instanceof Error ? error.message : '初始化失败'
      }
    } finally {
      busy.value = false
    }
  }

  async function setup(password: string): Promise<void> {
    assertMasterPin(password)
    busy.value = true
    errorMessage.value = null
    try {
      const created = await createVault(password)
      const nextRecord = markVaultAsPinProtected(created.record)
      await (await getDatabase()).saveVaultRecord(nextRecord)
      record.value = nextRecord
      dek.value = created.dek
      payload.value = created.payload
      status.value = 'unlocked'
      touchActivity()
      await setScreenProtection(settings.value.screenProtectionEnabled)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '创建保险箱失败'
      throw error
    } finally {
      busy.value = false
    }
  }

  async function unlock(password: string): Promise<void> {
    if (!record.value) throw new Error('尚未创建保险箱')
    if (vaultUsesMasterPin(record.value)) assertMasterPin(password)
    busy.value = true
    errorMessage.value = null
    try {
      const opened = await unlockVault(password, record.value)
      dek.value = opened.dek
      payload.value = opened.payload
      status.value = 'unlocked'
      touchActivity()
      await setScreenProtection(settings.value.screenProtectionEnabled)
    } catch (error) {
      if (error instanceof CryptoError && error.code === 'UNSUPPORTED_VERSION') {
        status.value = 'legacy_reset_required'
        errorMessage.value = '检测到旧版开发数据，需要清空后重新创建保险箱。'
        throw error
      }
      errorMessage.value =
        error instanceof CryptoError && error.code === 'WRONG_PASSWORD'
          ? vaultUsesMasterPin(record.value)
            ? '主 PIN 错误'
            : '主密码错误'
          : error instanceof Error
            ? error.message
            : '解锁失败'
      throw error
    } finally {
      busy.value = false
    }
  }

  async function unlockWithBiometrics(): Promise<void> {
    if (!record.value) throw new Error('尚未创建保险箱')
    busy.value = true
    errorMessage.value = null
    try {
      const biometricDek = await unlockDekWithBiometrics()
      const openedPayload = await openPayload(biometricDek, record.value.cipher)
      dek.value = biometricDek
      payload.value = openedPayload
      status.value = 'unlocked'
      touchActivity()
      await setScreenProtection(settings.value.screenProtectionEnabled)
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      errorMessage.value = code === 'CANCELLED' ? null : '生物识别解锁失败，请使用 PIN 解锁'
      await refreshBiometricStatus()
      throw error
    } finally {
      busy.value = false
    }
  }

  async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!isUnlocked.value || !dek.value) throw new Error('请先解锁保险箱')
      await enableBiometricUnlock(dek.value)
    } else {
      await disableBiometricUnlock()
    }
    await refreshBiometricStatus()
    touchActivity()
  }

  function lock(): void {
    void stopActiveScanner()
    void setScreenProtection(false)
    void clearSensitiveClipboard()
    dek.value = null
    payload.value = null
    status.value = record.value ? 'locked' : 'needs_setup'
  }

  async function savePayload(next: VaultPayload): Promise<void> {
    if (!dek.value || !record.value || !isUnlocked.value) throw new Error('保险箱未解锁')
    const normalized = normalizeVaultPayload(next)
    const nextRecord = await persistPayload(dek.value, record.value, normalized)
    await (await getDatabase()).saveVaultRecord(nextRecord)
    record.value = nextRecord
    payload.value = normalized
    touchActivity()
  }

  async function changeMasterPassword(currentPassword: string, nextPassword: string): Promise<void> {
    if (!record.value || !isUnlocked.value) throw new Error('保险箱未解锁')
    if (vaultUsesMasterPin(record.value)) assertMasterPin(currentPassword)
    assertMasterPin(nextPassword)
    busy.value = true
    try {
      const changed = await rewrapVaultPassword(currentPassword, nextPassword, record.value)
      const nextRecord = markVaultAsPinProtected(changed.record)
      await (await getDatabase()).saveVaultRecord(nextRecord)
      record.value = nextRecord
      dek.value = changed.dek
      payload.value = changed.payload
      touchActivity()
    } finally {
      busy.value = false
    }
  }

  async function saveSettings(next: AppSettings): Promise<void> {
    const normalized = normalizeSettings(next)
    if (isUnlocked.value) await setScreenProtection(normalized.screenProtectionEnabled)
    await (await getDatabase()).saveSettings(normalized)
    settings.value = normalized
    applyTheme(normalized.theme)
    touchActivity()
  }

  async function importVault(
    nextRecord: VaultRecord,
    password: string,
    portableSettings?: PortableSettings,
  ): Promise<void> {
    assertVaultRecord(nextRecord)
    if (vaultUsesMasterPin(nextRecord)) assertMasterPin(password)
    await unlockVault(password, nextRecord)
    const nextSettings = normalizeSettings({
      ...settings.value,
      ...portableSettings,
      screenProtectionEnabled: settings.value.screenProtectionEnabled,
    })
    await disableBiometricUnlock()
    await (await getDatabase()).replaceAll(nextRecord, nextSettings)
    record.value = nextRecord
    settings.value = nextSettings
    applyTheme(nextSettings.theme)
    lock()
  }

  async function resetLocalData(): Promise<void> {
    lock()
    await disableBiometricUnlock()
    await clearLegacyBiometricMaterial()
    await (await getDatabase()).clearLocalData()
    record.value = null
    settings.value = { ...DEFAULT_APP_SETTINGS }
    applyTheme(settings.value.theme)
    status.value = 'needs_setup'
    errorMessage.value = null
  }

  function checkAutoLock(): boolean {
    if (!isUnlocked.value || settings.value.autoLockSeconds <= 0) return false
    if (Date.now() - lastActiveAt.value < settings.value.autoLockSeconds * 1000) return false
    lock()
    return true
  }

  return {
    status,
    busy,
    errorMessage,
    lastActiveAt,
    record,
    settings,
    biometricStatus,
    dek,
    payload,
    isUnlocked,
    hasVault,
    bootstrap,
    setup,
    unlock,
    unlockWithBiometrics,
    setBiometricUnlockEnabled,
    refreshBiometricStatus,
    lock,
    savePayload,
    changeMasterPassword,
    saveSettings,
    importVault,
    resetLocalData,
    touchActivity,
    checkAutoLock,
  }
})
