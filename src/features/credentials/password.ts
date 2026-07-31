const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*_-+=?'

export interface PasswordOptions {
  length?: number
  includeSymbols?: boolean
}

function randomIndex(max: number): number {
  const limit = 256 - (256 % max)
  const byte = new Uint8Array(1)
  do crypto.getRandomValues(byte)
  while (byte[0]! >= limit)
  return byte[0]! % max
}

export function generatePassword(options: PasswordOptions = {}): string {
  const length = Math.min(128, Math.max(12, options.length ?? 20))
  const groups = [LOWER, UPPER, DIGITS]
  if (options.includeSymbols ?? true) groups.push(SYMBOLS)
  const all = groups.join('')
  const chars = groups.map((group) => group[randomIndex(group.length)]!)
  while (chars.length < length) chars.push(all[randomIndex(all.length)]!)
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1)
    ;[chars[index], chars[swap]] = [chars[swap]!, chars[index]!]
  }
  return chars.join('')
}
