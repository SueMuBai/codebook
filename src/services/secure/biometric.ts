import { Preferences } from '@capacitor/preferences'

const LEGACY_DEK_KEY = 'codebook.biometric.wrappedDek'

/**
 * v1 intentionally disables biometric unlock until DEK wrapping uses Android Keystore.
 * This cleanup removes the raw DEK written by the prototype implementation.
 */
export async function clearLegacyBiometricMaterial(): Promise<void> {
  await Preferences.remove({ key: LEGACY_DEK_KEY })
}
