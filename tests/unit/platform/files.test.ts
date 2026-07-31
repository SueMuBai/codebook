import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({ uri: 'content://codebook/export.csv' })),
  deleteFile: vi.fn(async () => undefined),
  share: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: mocks.writeFile,
    deleteFile: mocks.deleteFile,
  },
}))

vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}))

import { isExternalActivityActive } from '@/services/platform/externalActivity'
import { saveTextFile } from '@/services/platform/files'

describe('native file export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeFile.mockResolvedValue({ uri: 'content://codebook/export.csv' })
    mocks.deleteFile.mockResolvedValue(undefined)
    mocks.share.mockResolvedValue(undefined)
  })

  it('shares through native services and removes the cache file afterward', async () => {
    await saveTextFile('export.csv', 'secret', 'text/csv')
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'export.csv',
      data: 'secret',
      directory: 'CACHE',
      encoding: 'utf8',
      recursive: true,
    })
    expect(mocks.share).toHaveBeenCalledWith({
      title: 'export.csv',
      url: 'content://codebook/export.csv',
      dialogTitle: '保存或分享文件',
    })
    expect(mocks.deleteFile).toHaveBeenCalledWith({ path: 'export.csv', directory: 'CACHE' })
    expect(isExternalActivityActive()).toBe(false)
  })

  it('still removes the cache file when the share sheet is cancelled', async () => {
    mocks.share.mockRejectedValue(new Error('Share canceled'))
    await expect(saveTextFile('export.csv', 'secret', 'text/csv')).rejects.toThrow('Share canceled')
    expect(mocks.deleteFile).toHaveBeenCalledOnce()
    expect(isExternalActivityActive()).toBe(false)
  })
})
