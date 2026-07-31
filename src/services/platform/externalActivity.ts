let activeOperations = 0

/**
 * System-owned UI launched by codebook (file picker/share sheet) temporarily
 * covers the Activity. The app remains protected by FLAG_SECURE, while the
 * originating Promise must stay alive so the native result can be delivered.
 */
export async function runExternalActivity<T>(operation: () => Promise<T>): Promise<T> {
  activeOperations += 1
  try {
    return await operation()
  } finally {
    activeOperations = Math.max(0, activeOperations - 1)
  }
}

export function isExternalActivityActive(): boolean {
  return activeOperations > 0
}
