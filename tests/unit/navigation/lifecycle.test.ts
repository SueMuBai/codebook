import { describe, expect, it } from 'vitest'
import { resolveNativeBackAction } from '@/app/lifecycle'

describe('Android back action', () => {
  it('exits from the lock page even when WebView history exists', () => {
    expect(resolveNativeBackAction('/lock', false, true)).toBe('exit')
  })

  it('locks from either unlocked root page', () => {
    expect(resolveNativeBackAction('/vault', true, true)).toBe('lock')
    expect(resolveNativeBackAction('/settings', true, true)).toBe('lock')
  })

  it('navigates back from a secondary page before locking', () => {
    expect(resolveNativeBackAction('/vault/example', true, true)).toBe('back')
  })
})
