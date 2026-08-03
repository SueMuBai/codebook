/**
 * QR scanner adapter — Android ML Kit + Web getUserMedia/jsQR.
 */
import { Capacitor } from '@capacitor/core'

export interface QrScanResult {
  rawValue: string
}

export interface QrScanner {
  isSupported(): Promise<boolean>
  /** Full-screen scan; resolves with first QR or rejects on cancel/error. Always stops camera. */
  scanOnce(): Promise<QrScanResult>
  stop(): Promise<void>
}

type ListenerHandle = { remove: () => Promise<void> | void }

let activeStop: (() => Promise<void>) | null = null

export async function stopActiveScanner(): Promise<void> {
  if (activeStop) {
    const stop = activeStop
    activeStop = null
    await stop()
  }
}

function createWebScanner(): QrScanner {
  let stream: MediaStream | null = null
  let raf = 0
  let video: HTMLVideoElement | null = null
  let overlay: HTMLDivElement | null = null
  let cancelCurrent: (() => Promise<void>) | null = null

  async function cleanup(): Promise<void> {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    if (video) {
      video.pause()
      video.srcObject = null
      video.remove()
      video = null
    }
    if (overlay) {
      overlay.remove()
      overlay = null
    }
  }

  async function stop(): Promise<void> {
    if (cancelCurrent) {
      await cancelCurrent()
      return
    }
    await cleanup()
  }

  return {
    async isSupported() {
      return !!(navigator.mediaDevices?.getUserMedia)
    },
    async scanOnce() {
      await stop()

      return new Promise<QrScanResult>((resolve, reject) => {
        let settled = false
        const finish = async (fn: () => void) => {
          if (settled) return
          settled = true
          if (cancelCurrent === cancel) cancelCurrent = null
          if (activeStop === cancel) activeStop = null
          await cleanup()
          fn()
        }
        const cancel = () => finish(() => reject(new Error('扫码已停止')))
        cancelCurrent = cancel
        activeStop = cancel

        void (async () => {
          try {
            const jsQR = (await import('jsqr')).default
            if (settled) return
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } },
              audio: false,
            })
            if (settled) {
              await cleanup()
              return
            }
            video = document.createElement('video')
            video.setAttribute('playsinline', 'true')
            video.muted = true
            video.srcObject = stream
            await video.play()
            if (settled) {
              await cleanup()
              return
            }

            overlay = document.createElement('div')
            overlay.style.cssText =
              'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;'
            video.style.cssText = 'max-width:100%;max-height:80%;object-fit:contain;'
            const cancelBtn = document.createElement('button')
            cancelBtn.textContent = '取消'
            cancelBtn.style.cssText =
              'margin-top:16px;min-height:44px;padding:0 24px;border:0;border-radius:8px;background:#333;color:#fff;font-size:16px;'
            cancelBtn.onclick = () => void finish(() => reject(new Error('已取消扫码')))
            const hint = document.createElement('p')
            hint.textContent = '将 2FA 二维码置于取景框内'
            hint.style.cssText = 'color:#ccc;margin:12px 0 0;font-size:14px;'
            overlay.appendChild(video)
            overlay.appendChild(hint)
            overlay.appendChild(cancelBtn)
            document.body.appendChild(overlay)

            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) {
              await finish(() => reject(new Error('无法创建画布')))
              return
            }

            const tick = () => {
              if (settled || !video) return
              if (video.readyState >= video.HAVE_CURRENT_DATA) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                if (canvas.width > 0 && canvas.height > 0) {
                  ctx.drawImage(video, 0, 0)
                  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
                  const code = jsQR(image.data, image.width, image.height, {
                    inversionAttempts: 'dontInvert',
                  })
                  if (code?.data) {
                    void finish(() => resolve({ rawValue: code.data }))
                    return
                  }
                }
              }
              raf = requestAnimationFrame(tick)
            }
            raf = requestAnimationFrame(tick)
          } catch (error) {
            await finish(() =>
              reject(error instanceof Error ? error : new Error('无法打开相机')),
            )
          }
        })()
      })
    },
    stop,
  }
}

export function createNativeScanner(): QrScanner {
  let listener: ListenerHandle | null = null
  let cancelCurrent: (() => Promise<void>) | null = null

  async function cleanup(): Promise<void> {
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
      if (listener) {
        await listener.remove()
        listener = null
      }
      await BarcodeScanner.stopScan()
      document.documentElement.classList.remove('barcode-scanner-active')
      document.body.classList.remove('barcode-scanner-active')
    } catch {
      /* ignore */
    }
  }

  async function stop(): Promise<void> {
    if (cancelCurrent) {
      await cancelCurrent()
      return
    }
    await cleanup()
  }

  return {
    async isSupported() {
      try {
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
        const { supported } = await BarcodeScanner.isSupported()
        return supported
      } catch {
        return false
      }
    },
    async scanOnce() {
      await stop()

      return new Promise<QrScanResult>((resolve, reject) => {
        let settled = false
        const finish = async (fn: () => void) => {
          if (settled) return
          settled = true
          if (cancelCurrent === cancel) cancelCurrent = null
          if (activeStop === cancel) activeStop = null
          await cleanup()
          fn()
        }
        const cancel = () => finish(() => reject(new Error('扫码已停止')))
        cancelCurrent = cancel
        activeStop = cancel

        void (async () => {
          try {
            const { BarcodeScanner, BarcodeFormat } = await import(
              '@capacitor-mlkit/barcode-scanning'
            )
            if (settled) return

            const perm = await BarcodeScanner.checkPermissions()
            if (settled) return
            if (perm.camera !== 'granted') {
              const req = await BarcodeScanner.requestPermissions()
              if (settled) return
              if (req.camera !== 'granted') {
                await finish(() =>
                  reject(
                    new Error(
                      '相机权限已被拒绝，请在 Android 系统设置中为密语开启相机权限',
                    ),
                  ),
                )
                return
              }
            }

            document.documentElement.classList.add('barcode-scanner-active')
            document.body.classList.add('barcode-scanner-active')
            listener = await BarcodeScanner.addListener(
              'barcodesScanned',
              async (event) => {
                const raw = event.barcodes[0]?.rawValue
                if (raw) {
                  await finish(() => resolve({ rawValue: raw }))
                }
              },
            )
            if (settled) {
              await cleanup()
              return
            }
            await BarcodeScanner.startScan({
              formats: [BarcodeFormat.QrCode],
            })
            if (settled) await cleanup()
          } catch (error) {
            await finish(() =>
              reject(error instanceof Error ? error : new Error('扫码失败')),
            )
          }
        })()
      })
    },
    stop,
  }
}

let singleton: QrScanner | null = null

export function getQrScanner(): QrScanner {
  if (!singleton) {
    singleton = Capacitor.isNativePlatform()
      ? createNativeScanner()
      : createWebScanner()
  }
  return singleton
}
