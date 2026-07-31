import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { exportDekRaw, importDekRaw } from '@/features/crypto'
import { base64ToBytes, bytesToBase64 } from '@/utils/bytes'

const LEGACY_DEK_KEY = 'codebook.biometric.wrappedDek'
const EXPECTED_DEK_BYTES = 32

export interface BiometricStatus {
  available: boolean
  enabled: boolean
  reason: string
}

interface BiometricVaultPlugin {
  getStatus(): Promise<BiometricStatus>
  enable(options: { secret: string }): Promise<void>
  unlock(): Promise<{ secret: string }>
  disable(): Promise<void>
}

const NativeBiometricVault = registerPlugin<BiometricVaultPlugin>('BiometricVault')

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (!isAndroidNative()) return { available: false, enabled: false, reason: 'WEB_UNSUPPORTED' }
  return NativeBiometricVault.getStatus()
}

/**
 * Exports the in-memory DEK only long enough to hand it to the native bridge.
 * Native code immediately wraps it using an authentication-bound Keystore key.
 */
export async function enableBiometricUnlock(dek: CryptoKey): Promise<void> {
  if (!isAndroidNative()) throw new Error('生物识别解锁仅支持 Android 应用')
  const raw = await exportDekRaw(dek)
  try {
    await NativeBiometricVault.enable({ secret: bytesToBase64(raw) })
  } finally {
    raw.fill(0)
  }
}

/** Returns a DEK authorized by the current Android biometric prompt. */
export async function unlockDekWithBiometrics(): Promise<CryptoKey> {
  if (!isAndroidNative()) throw new Error('生物识别解锁仅支持 Android 应用')
  const result = await NativeBiometricVault.unlock()
  const raw = base64ToBytes(result.secret)
  try {
    if (raw.byteLength !== EXPECTED_DEK_BYTES) throw new Error('生物识别密钥长度无效')
    return await importDekRaw(raw)
  } finally {
    raw.fill(0)
  }
}

export async function disableBiometricUnlock(): Promise<void> {
  if (!isAndroidNative()) return
  await NativeBiometricVault.disable()
}

/** Removes plaintext prototype material from old development builds. */
export async function clearLegacyBiometricMaterial(): Promise<void> {
  await Preferences.remove({ key: LEGACY_DEK_KEY })
}
