import type { ThemeMode } from '@/types/domain'

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}
