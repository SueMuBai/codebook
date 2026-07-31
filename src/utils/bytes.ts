const b64Alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Uint8Array → standard Base64 (no whitespace). */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }

  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const triple = (a << 16) | (b << 8) | c
    result += b64Alphabet[(triple >> 18) & 63]
    result += b64Alphabet[(triple >> 12) & 63]
    result += i + 1 < bytes.length ? b64Alphabet[(triple >> 6) & 63] : '='
    result += i + 2 < bytes.length ? b64Alphabet[triple & 63] : '='
  }
  return result
}

/** Standard Base64 → Uint8Array. */
export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '')
  if (typeof atob === 'function') {
    const binary = atob(cleaned)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  }

  const padded = cleaned + '==='.slice((cleaned.length + 3) % 4)
  const len = (padded.length * 3) / 4 - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0)
  const out = new Uint8Array(len)
  let outIndex = 0
  for (let i = 0; i < padded.length; i += 4) {
    const n =
      (b64Alphabet.indexOf(padded[i]!) << 18) |
      (b64Alphabet.indexOf(padded[i + 1]!) << 12) |
      ((padded[i + 2] === '=' ? 0 : b64Alphabet.indexOf(padded[i + 2]!)) << 6) |
      (padded[i + 3] === '=' ? 0 : b64Alphabet.indexOf(padded[i + 3]!))
    if (outIndex < len) out[outIndex++] = (n >> 16) & 0xff
    if (outIndex < len) out[outIndex++] = (n >> 8) & 0xff
    if (outIndex < len) out[outIndex++] = n & 0xff
  }
  return out
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
