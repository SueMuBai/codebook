import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  assertVaultRecord,
  createVault,
  CryptoError,
  persistPayload,
  rewrapVaultPassword,
  unlockVault,
} from '@/features/crypto'
import { normalizeSettings } from '@/features/settings/validation'
import { normalizeVaultPayload } from '@/features/vault'
import { LegacyVaultError, getDatabase } from '@/services/database'
import { setScreenProtection } from '@/services/platform/screenProtection'
import { applyTheme } from '@/services/platform/theme'
import { stopActiveScanner } from '@/services/scanner/QrScanner'
import { clearLegacyBiometricMaterial } from '@/services/secure/biometric'
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

  /** Sensitive state: memory only while unlocked. */
  const dek = shallowRef<CryptoKey | null>(null)
  const payload = shallowRef<VaultPayload | null>(null)

  const isUnlocked = computed(() => status.value === 'unlocked')
  const hasVault = computed(() => record.value !== null)

  function touchActivity(): void {
    lastActiveAt.value = Date.now()
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
    assertPassword(password)
    busy.value = true
    errorMessage.value = null
    try {
      const created = await createVault(password)
      await (await getDatabase()).saveVaultRecord(created.record)
      record.value = created.record
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
          ? '主密码错误'
          : error instanceof Error
            ? error.message
            : '解锁失败'
      throw error
    } finally {
      busy.value = false
    }
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
    assertPassword(nextPassword)
    busy.value = true
    try {
      const changed = await rewrapVaultPassword(currentPassword, nextPassword, record.value)
      await (await getDatabase()).saveVaultRecord(changed.record)
      record.value = changed.record
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
    await unlockVault(password, nextRecord)
    const nextSettings = normalizeSettings({
      ...settings.value,
      ...portableSettings,
      screenProtectionEnabled: settings.value.screenProtectionEnabled,
    })
    await (await getDatabase()).replaceAll(nextRecord, nextSettings)
    record.value = nextRecord
    settings.value = nextSettings
    applyTheme(nextSettings.theme)
    lock()
  }

  async function resetLocalData(): Promise<void> {
    lock()
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
    dek,
    payload,
    isUnlocked,
    hasVault,
    bootstrap,
    setup,
    unlock,
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

function assertPassword(password: string): void {
  if (password.length < 8) throw new Error('主密码至少需要 8 位')
}
