import { describe, expect, it } from 'vitest'
import { APP_NAME, APP_NAME_EN, APP_VERSION } from '@/app/version'

describe('product identity', () => {
  it('uses the locked product names and v1 semver', () => {
    expect(APP_NAME).toBe('密语')
    expect(APP_NAME_EN).toBe('codebook')
    expect(APP_VERSION).toBe('1.0.0')
  })
})
