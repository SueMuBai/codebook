import { beforeEach, describe, expect, it, vi } from 'vitest'

const scanner = vi.hoisted(() => ({
  isSupported: vi.fn(async () => ({ supported: true })),
  stopScan: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ camera: 'prompt' as const })),
  requestPermissions: vi.fn(async () => ({ camera: 'denied' as const })),
  addListener: vi.fn(),
  startScan: vi.fn(),
}))

vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeScanner: scanner,
  BarcodeFormat: { QrCode: 'QR_CODE' },
}))

import { createNativeScanner, stopActiveScanner } from '@/services/scanner/QrScanner'

describe('native QR scanner permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scanner.checkPermissions.mockResolvedValue({ camera: 'prompt' })
    scanner.requestPermissions.mockResolvedValue({ camera: 'denied' })
  })

  it('reports a denied camera request without starting the scanner', async () => {
    await expect(createNativeScanner().scanOnce()).rejects.toThrow(
      '相机权限已被拒绝，请在 Android 系统设置中为密语开启相机权限',
    )
    expect(scanner.requestPermissions).toHaveBeenCalledOnce()
    expect(scanner.startScan).not.toHaveBeenCalled()
  })

  it('reports a persistently denied permission without starting the scanner', async () => {
    scanner.checkPermissions.mockResolvedValue({ camera: 'denied' })

    await expect(createNativeScanner().scanOnce()).rejects.toThrow(
      '相机权限已被拒绝，请在 Android 系统设置中为密语开启相机权限',
    )
    expect(scanner.startScan).not.toHaveBeenCalled()
  })

  it('cancels safely while the Android permission prompt is still open', async () => {
    let resolvePermission!: (value: { camera: 'granted' }) => void
    scanner.requestPermissions.mockImplementation(
      () => new Promise((resolve) => {
        resolvePermission = resolve
      }),
    )

    const scanning = createNativeScanner().scanOnce()
    await vi.waitFor(() => expect(scanner.requestPermissions).toHaveBeenCalledOnce())
    await stopActiveScanner()
    await expect(scanning).rejects.toThrow('扫码已停止')

    resolvePermission({ camera: 'granted' })
    await Promise.resolve()
    expect(scanner.startScan).not.toHaveBeenCalled()
    expect(scanner.stopScan).toHaveBeenCalled()
  })
})
