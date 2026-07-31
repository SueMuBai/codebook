import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSensitiveClipboard, copyText } from '@/utils/clipboard'

describe('sensitive clipboard lifecycle', () => {
  let clipboard = ''
  const writeText = vi.fn(async (value: string) => {
    clipboard = value
  })
  const readText = vi.fn(async () => clipboard)

  beforeEach(() => {
    vi.useFakeTimers()
    clipboard = ''
    writeText.mockClear()
    readText.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText },
    })
  })

  afterEach(async () => {
    await clearSensitiveClipboard()
    vi.useRealTimers()
  })

  it('clears the copied secret after the configured delay', async () => {
    await copyText('secret', 30)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(clipboard).toBe('')
  })

  it('does not overwrite clipboard content changed by the user', async () => {
    await copyText('secret', 30)
    clipboard = 'new user content'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(clipboard).toBe('new user content')
  })

  it('replaces the old timer and clears immediately when the vault locks', async () => {
    await copyText('first', 15)
    await copyText('second', 60)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(clipboard).toBe('second')

    await clearSensitiveClipboard()
    expect(clipboard).toBe('')
  })
})
