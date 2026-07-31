const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
  const compact = input.replace(/[\s-]/g, '').toUpperCase()
  if (!compact) return new Uint8Array(0)
  if (!/^[A-Z2-7]*={0,6}$/.test(compact)) {
    throw new Error('Invalid base32 alphabet or padding')
  }

  const paddingIndex = compact.indexOf('=')
  const cleaned = paddingIndex >= 0 ? compact.slice(0, paddingIndex) : compact
  const paddingLength = compact.length - cleaned.length
  const remainder = cleaned.length % 8
  const expectedPadding = new Map([
    [0, 0],
    [2, 6],
    [4, 4],
    [5, 3],
    [7, 1],
  ]).get(remainder)
  if (expectedPadding === undefined || (paddingLength > 0 && paddingLength !== expectedPadding)) {
    throw new Error('Invalid base32 length or padding')
  }

  let bits = 0
  let value = 0
  const out: number[] = []

  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) {
      throw new Error(`Invalid base32 character: ${ch}`)
    }
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) {
    throw new Error('Invalid non-zero base32 padding bits')
  }

  return new Uint8Array(out)
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31]
  }

  return output
}
