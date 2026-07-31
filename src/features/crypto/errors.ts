export type CryptoErrorCode =
  | 'WRONG_PASSWORD'
  | 'TAMPERED'
  | 'INVALID_PAYLOAD'
  | 'UNSUPPORTED_VERSION'
  | 'EMPTY_PASSWORD'
  | 'CRYPTO_UNAVAILABLE'

export class CryptoError extends Error {
  readonly code: CryptoErrorCode
  readonly causeError?: unknown

  constructor(code: CryptoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
    if (options?.cause !== undefined) {
      this.causeError = options.cause
    }
  }
}

export function isCryptoError(error: unknown): error is CryptoError {
  return error instanceof CryptoError
}
