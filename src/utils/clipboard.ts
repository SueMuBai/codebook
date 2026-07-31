let clearTimer: ReturnType<typeof setTimeout> | null = null
let lastCopiedValue: string | null = null
let copyGeneration = 0

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

export async function copyText(text: string, clearAfterSeconds = 0): Promise<void> {
  await writeClipboard(text)

  copyGeneration += 1
  const generation = copyGeneration
  lastCopiedValue = text
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = null

  if (clearAfterSeconds > 0) {
    clearTimer = setTimeout(() => {
      void clearCopiedText(text, generation)
    }, clearAfterSeconds * 1000)
  }
}

async function clearCopiedText(expected: string, generation: number): Promise<void> {
  if (generation !== copyGeneration || lastCopiedValue !== expected) return
  try {
    if (navigator.clipboard?.readText) {
      const current = await navigator.clipboard.readText()
      if (generation !== copyGeneration || lastCopiedValue !== expected) return
      if (current !== expected) {
        lastCopiedValue = null
        return
      }
    }
    await writeClipboard('')
  } catch {
    // Clipboard read/clear can be denied after the page loses focus.
  } finally {
    if (generation === copyGeneration) {
      lastCopiedValue = null
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = null
    }
  }
}

/** Immediately remove the last value copied by codebook, without overwriting newer user content. */
export async function clearSensitiveClipboard(): Promise<void> {
  const expected = lastCopiedValue
  const generation = copyGeneration
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = null
  if (expected === null) return
  await clearCopiedText(expected, generation)
}
