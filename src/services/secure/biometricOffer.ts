import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { showConfirmDialog } from 'vant'
import type { BiometricStatus } from '@/services/secure/biometric'

const OFFER_DISMISSED_KEY = 'codebook.biometric.offerDismissed'

/** True when the device supports biometrics, unlock is off, and the user hasn't declined the offer. */
export async function shouldOfferBiometricSetup(status: BiometricStatus): Promise<boolean> {
  if (!status.available || status.enabled) return false
  const { value } = await Preferences.get({ key: OFFER_DISMISSED_KEY })
  return value !== '1'
}

/** Asks once; declining is remembered so the offer never nags again. */
export async function confirmBiometricSetup(): Promise<boolean> {
  try {
    await showConfirmDialog({
      title: '启用指纹或人脸解锁',
      message: '下次进入保险箱时，直接通过系统生物识别验证，无需输入主 PIN。可随时在设置中关闭。',
      confirmButtonText: '立即启用',
      cancelButtonText: '暂不',
    })
    return true
  } catch {
    // Only a visible decline counts; dialogs dismissed by auto-lock shouldn't silence the offer.
    if (document.visibilityState === 'visible') {
      await Preferences.set({ key: OFFER_DISMISSED_KEY, value: '1' })
    }
    return false
  }
}

export async function clearBiometricOfferDismissal(): Promise<void> {
  await Preferences.remove({ key: OFFER_DISMISSED_KEY })
}

interface BiometricSession {
  refreshBiometricStatus(): Promise<BiometricStatus>
  setBiometricUnlockEnabled(enabled: boolean): Promise<void>
}

/** Full offer flow after vault creation or a manual PIN unlock. */
export async function offerBiometricSetupIfNeeded(
  session: BiometricSession,
): Promise<'enabled' | 'skipped' | 'failed'> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'skipped'
  const status = await session.refreshBiometricStatus()
  if (!(await shouldOfferBiometricSetup(status))) return 'skipped'
  if (!(await confirmBiometricSetup())) return 'skipped'
  try {
    await session.setBiometricUnlockEnabled(true)
    return 'enabled'
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    return code === 'CANCELLED' ? 'skipped' : 'failed'
  }
}
