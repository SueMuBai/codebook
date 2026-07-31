import { describe, expect, it } from 'vitest'
import { generatePassword } from '@/features/credentials'

describe('password generator', () => {
  it('generates the requested length with every enabled group', () => {
    const password = generatePassword({ length: 32, includeSymbols: true })
    expect(password).toHaveLength(32)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/\d/)
    expect(password).toMatch(/[^a-zA-Z\d]/)
  })

  it('enforces the safe minimum length', () => {
    expect(generatePassword({ length: 4 })).toHaveLength(12)
  })
})
