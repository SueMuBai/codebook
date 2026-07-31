import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { base32Decode, base32Encode, generateTotp, parseOtpAuthUri } from '@/features/totp'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

describe('TOTP', () => {
  const secret = (value: string) => base32Encode(new TextEncoder().encode(value))

  it.each([
    ['SHA1', '12345678901234567890', '94287082'],
    ['SHA256', '12345678901234567890123456789012', '46119246'],
    ['SHA512', '1234567890123456789012345678901234567890123456789012345678901234', '90693936'],
  ] as const)('matches RFC 6238 %s vector', async (algorithm, rawSecret, expected) => {
    const result = await generateTotp({
      secretBase32: secret(rawSecret),
      digits: 8,
      period: 30,
      algorithm,
      timestampSec: 59,
    })
    expect(result.code).toBe(expected)
  })

  it('strictly parses supported otpauth parameters', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&period=45&algorithm=SHA256',
    )
    expect(parsed).toMatchObject({
      issuer: 'Example',
      accountName: 'alice@example.com',
      digits: 8,
      period: 45,
      algorithm: 'SHA256',
    })
  })

  it('rejects HOTP, invalid Base32 and unsupported parameters', () => {
    expect(() => parseOtpAuthUri('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP')).toThrow('只支持')
    expect(() => parseOtpAuthUri('otpauth://totp/Test?secret=***')).toThrow('base32')
    expect(() => parseOtpAuthUri('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&digits=9')).toThrow('位数')
    expect(() => parseOtpAuthUri('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=MD5')).toThrow('算法')
  })

  it('rejects non-canonical Base32 length, padding and trailing bits', () => {
    expect(() => base32Decode('A')).toThrow('length')
    expect(() => base32Decode('MY====')).toThrow('padding')
    expect(() => base32Decode('MZ')).toThrow('padding bits')
    expect(new TextDecoder().decode(base32Decode('MY======'))).toBe('f')
  })
})
