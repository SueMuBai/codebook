import { router } from '@/app/router'

/**
 * In-app back that survives deep links: with no in-app history entry
 * (e.g. arriving via unlock redirect), back would leave the app or land
 * on the lock screen, so fall back to replacing with a sensible parent.
 */
export function goBackOr(fallback: string): void {
  if (window.history.state?.back) router.back()
  else void router.replace(fallback)
}
