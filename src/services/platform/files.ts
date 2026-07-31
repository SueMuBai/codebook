import { Capacitor } from '@capacitor/core'
import { runExternalActivity } from './externalActivity'

export async function saveTextFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    try {
      await runExternalActivity(() =>
        Share.share({ title: filename, url: result.uri, dialogTitle: '保存或分享文件' }),
      )
    } finally {
      await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(
        () => undefined,
      )
    }
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function pickTextFile(accept: string): Promise<{ name: string; content: string }> {
  const pick = () => new Promise<{ name: string; content: string }>((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    let cancelTimer = 0

    const cleanup = () => {
      window.clearTimeout(cancelTimer)
      window.removeEventListener('focus', handleWindowFocus)
      input.onchange = null
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const succeed = (file: File, content: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ name: file.name, content })
    }
    const handleWindowFocus = () => {
      cancelTimer = window.setTimeout(() => {
        if (!input.files?.[0]) fail(new Error('未选择文件'))
      }, 300)
    }

    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        fail(new Error('未选择文件'))
        return
      }
      void file
        .text()
        .then((content) => succeed(file, content))
        .catch(() => fail(new Error('读取文件失败')))
    }
    window.addEventListener('focus', handleWindowFocus, { once: true })
    input.click()
  })

  return Capacitor.isNativePlatform() ? runExternalActivity(pick) : pick()
}
