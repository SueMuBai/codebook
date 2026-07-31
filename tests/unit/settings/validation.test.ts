import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '@/features/settings/validation'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'

describe('settings normalization', () => {
  it('keeps supported values', () => {
    expect(
      normalizeSettings({
        autoLockSeconds: 30,
        clipboardClearSeconds: 15,
        theme: 'dark',
        totpRevealSeconds: 10,
        screenProtectionEnabled: false,
      }),
    ).toEqual({
      autoLockSeconds: 30,
      clipboardClearSeconds: 15,
      theme: 'dark',
      totpRevealSeconds: 10,
      screenProtectionEnabled: false,
    })
  })

  it('falls back securely for unsupported values', () => {
    expect(
      normalizeSettings({
        autoLockSeconds: 31,
        clipboardClearSeconds: -1,
        theme: 'unknown' as 'dark',
        totpRevealSeconds: 7,
      }),
    ).toEqual(DEFAULT_APP_SETTINGS)
  })
})
