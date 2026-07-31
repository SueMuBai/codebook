import type { AppSettings, ThemeMode } from '@/types/domain'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'

const AUTO_LOCK_OPTIONS = new Set([0, 30, 60, 90, 180, 300])
const CLIPBOARD_OPTIONS = new Set([0, 15, 30, 60])
const TOTP_REVEAL_OPTIONS = new Set([0, 10, 30, 60])

function option(value: unknown, allowed: Set<number>, fallback: number): number {
  return typeof value === 'number' && allowed.has(value) ? value : fallback
}

function theme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : DEFAULT_APP_SETTINGS.theme
}

export function normalizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    autoLockSeconds: option(
      value?.autoLockSeconds,
      AUTO_LOCK_OPTIONS,
      DEFAULT_APP_SETTINGS.autoLockSeconds,
    ),
    clipboardClearSeconds: option(
      value?.clipboardClearSeconds,
      CLIPBOARD_OPTIONS,
      DEFAULT_APP_SETTINGS.clipboardClearSeconds,
    ),
    theme: theme(value?.theme),
    totpRevealSeconds: option(
      value?.totpRevealSeconds,
      TOTP_REVEAL_OPTIONS,
      DEFAULT_APP_SETTINGS.totpRevealSeconds,
    ),
    screenProtectionEnabled:
      typeof value?.screenProtectionEnabled === 'boolean'
        ? value.screenProtectionEnabled
        : DEFAULT_APP_SETTINGS.screenProtectionEnabled,
  }
}

export { AUTO_LOCK_OPTIONS, CLIPBOARD_OPTIONS, TOTP_REVEAL_OPTIONS }
