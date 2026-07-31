import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { router } from '@/app/router'
import { dispatchBackHandler } from '@/services/navigation/backStack'
import { cancelActiveDialog } from '@/services/navigation/dialogBack'
import { isExternalActivityActive } from '@/services/platform/externalActivity'
import { useSessionStore } from '@/stores/session'

let initialized = false

export type NativeBackAction = 'exit' | 'lock' | 'back'

export function resolveNativeBackAction(
  path: string,
  isUnlocked: boolean,
  canGoBack: boolean,
): NativeBackAction {
  if (path === '/lock') return 'exit'
  if (isUnlocked && (path === '/vault' || path === '/settings')) return 'lock'
  if (canGoBack) return 'back'
  return isUnlocked ? 'lock' : 'exit'
}

export function setupNativeLifecycle(): void {
  if (initialized) return
  initialized = true
  const session = useSessionStore()

  setInterval(() => {
    if (session.checkAutoLock()) void router.replace('/lock')
  }, 1_000)

  const touch = () => session.touchActivity()
  document.addEventListener('pointerdown', touch, { passive: true })
  document.addEventListener('keydown', touch)
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'hidden' &&
      session.isUnlocked &&
      !isExternalActivityActive()
    ) {
      cancelActiveDialog()
      session.lock()
      void router.replace('/lock')
    }
  })

  if (!Capacitor.isNativePlatform()) return

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive && session.isUnlocked && !isExternalActivityActive()) {
      cancelActiveDialog()
      session.lock()
      void router.replace('/lock')
    }
  })

  void CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
    const overlayResult = dispatchBackHandler()
    if (overlayResult === true) return
    if (overlayResult !== false && (await overlayResult)) return
    if (cancelActiveDialog()) return
    const action = resolveNativeBackAction(
      router.currentRoute.value.path,
      session.isUnlocked,
      canGoBack,
    )
    if (action === 'exit') {
      await CapacitorApp.exitApp()
      return
    }
    if (action === 'lock') {
      cancelActiveDialog()
      session.lock()
      await router.replace('/lock')
      return
    }
    window.history.back()
  })
}
