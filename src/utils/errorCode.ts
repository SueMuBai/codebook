/** Extracts a string error code from plugin/native rejections (e.g. 'CANCELLED'). */
export function extractErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
}
