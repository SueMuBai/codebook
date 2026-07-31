import type { TotpAlgorithm, TotpDigits } from '@/types/domain'
import { base32Decode } from './base32'

function algorithmToHash(algo: TotpAlgorithm): AlgorithmIdentifier {
  switch (algo) {
    case 'SHA256':
      return 'SHA-256'
    case 'SHA512':
      return 'SHA-512'
    default:
      return 'SHA-1'
  }
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  // high 32 bits zero for typical counters
  view.setUint32(0, Math.floor(counter / 0x100000000), false)
  view.setUint32(4, counter >>> 0, false)
  return new Uint8Array(buf)
}

export interface GenerateTotpOptions {
  secretBase32: string
  digits?: TotpDigits
  period?: number
  algorithm?: TotpAlgorithm
  /** Unix seconds; defaults to now */
  timestampSec?: number
}

export async function generateTotp(options: GenerateTotpOptions): Promise<{
  code: string
  remainingSec: number
  period: number
}> {
  const digits = options.digits ?? 6
  const period = options.period ?? 30
  const algorithm = options.algorithm ?? 'SHA1'
  const timestamp =
    options.timestampSec ?? Math.floor(Date.now() / 1000)
  const counter = Math.floor(timestamp / period)
  const remainingSec = period - (timestamp % period)

  const keyBytes = base32Decode(options.secretBase32)
  const subtle = globalThis.crypto.subtle
  const key = await subtle.importKey(
    'raw',
    Uint8Array.from(keyBytes),
    { name: 'HMAC', hash: algorithmToHash(algorithm) },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(
    await subtle.sign('HMAC', key, counterToBytes(counter)),
  )
  const offset = mac[mac.length - 1]! & 0x0f
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff)
  const mod = 10 ** digits
  const code = (bin % mod).toString().padStart(digits, '0')
  return { code, remainingSec, period }
}
