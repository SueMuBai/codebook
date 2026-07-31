import { CryptoError } from './errors'

export function getSubtle(): SubtleCrypto {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) {
    throw new CryptoError(
      'CRYPTO_UNAVAILABLE',
      'Web Crypto API (crypto.subtle) is not available in this environment',
    )
  }
  return cryptoApi.subtle
}

export function getRandomValues(length: number): Uint8Array {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new CryptoError(
      'CRYPTO_UNAVAILABLE',
      'crypto.getRandomValues is not available in this environment',
    )
  }
  const bytes = new Uint8Array(length)
  cryptoApi.getRandomValues(bytes)
  return bytes
}
