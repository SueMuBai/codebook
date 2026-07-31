import type { TotpAlgorithm, TotpDigits, TotpSecret } from '@/types/domain'
import { createId } from '@/utils/id'
import { base32Decode } from './base32'

function normalizeSecret(value: string): string {
  const secret = value.replace(/[\s-]+/g, '').toUpperCase()
  if (!secret) throw new Error('Secret 不能为空')
  if (base32Decode(secret).byteLength === 0) throw new Error('Secret 不是有效 Base32')
  return secret
}

function parseDigits(value: string | null): TotpDigits {
  if (value == null) return 6
  const digits = Number(value)
  if (digits !== 6 && digits !== 7 && digits !== 8) throw new Error('TOTP 位数不受支持')
  return digits
}

function parsePeriod(value: string | null): number {
  if (value == null) return 30
  const period = Number(value)
  if (!Number.isInteger(period) || period <= 0 || period > 300) {
    throw new Error('TOTP 周期必须是 1–300 秒的整数')
  }
  return period
}

function parseAlgorithm(value: string | null): TotpAlgorithm {
  if (value == null) return 'SHA1'
  const algorithm = value.toUpperCase().replace('-', '')
  if (algorithm !== 'SHA1' && algorithm !== 'SHA256' && algorithm !== 'SHA512') {
    throw new Error('TOTP 算法不受支持')
  }
  return algorithm
}

export function parseOtpAuthUri(uri: string): Omit<TotpSecret, 'id'> {
  let url: URL
  try {
    url = new URL(uri.trim())
  } catch {
    throw new Error('otpauth URI 无效')
  }
  if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
    throw new Error('只支持 otpauth://totp URI')
  }

  const label = decodeURIComponent(url.pathname.replace(/^\//, '')).trim()
  let issuer = url.searchParams.get('issuer')?.trim() || undefined
  let accountName = label || undefined
  if (label.includes(':')) {
    const [prefix, ...rest] = label.split(':')
    issuer ||= prefix?.trim() || undefined
    accountName = rest.join(':').trim() || undefined
  }

  return {
    secret: normalizeSecret(url.searchParams.get('secret') ?? ''),
    issuer,
    accountName,
    digits: parseDigits(url.searchParams.get('digits')),
    period: parsePeriod(url.searchParams.get('period')),
    algorithm: parseAlgorithm(url.searchParams.get('algorithm')),
  }
}

export function totpFromManual(input: {
  secret: string
  issuer?: string
  accountName?: string
  digits?: TotpDigits
  period?: number
  algorithm?: TotpAlgorithm
  label?: string
}): TotpSecret {
  const period = input.period ?? 30
  if (!Number.isInteger(period) || period <= 0 || period > 300) {
    throw new Error('TOTP 周期必须是 1–300 秒的整数')
  }
  return {
    id: createId('totp'),
    secret: normalizeSecret(input.secret),
    issuer: input.issuer?.trim() || undefined,
    accountName: input.accountName?.trim() || undefined,
    digits: input.digits ?? 6,
    period,
    algorithm: input.algorithm ?? 'SHA1',
    label: input.label?.trim() || undefined,
  }
}

export function totpFromUri(uri: string): TotpSecret {
  return { id: createId('totp'), ...parseOtpAuthUri(uri) }
}
