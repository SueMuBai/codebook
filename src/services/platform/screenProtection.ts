import { Capacitor, registerPlugin } from '@capacitor/core'

interface ScreenProtectionPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>
}

const NativeScreenProtection = registerPlugin<ScreenProtectionPlugin>('ScreenProtection')

export async function setScreenProtection(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await NativeScreenProtection.setEnabled({ enabled })
}
