import { showConfirmDialog } from 'vant'

/** Themed destructive-action confirm; resolves true only when the user confirms. */
export async function confirmDanger(options: {
  title: string
  message: string
  confirmText: string
}): Promise<boolean> {
  try {
    await showConfirmDialog({
      title: options.title,
      message: options.message,
      confirmButtonText: options.confirmText,
      confirmButtonColor: 'var(--color-danger)',
    })
    return true
  } catch {
    return false
  }
}
