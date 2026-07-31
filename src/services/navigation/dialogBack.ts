/**
 * Cancel the top-most visible Vant confirm dialog.
 *
 * Calling Vant's `closeDialog()` only hides the function-call instance and
 * leaves its Promise pending. Clicking the cancel action preserves the normal
 * rejection/catch flow used by every destructive confirmation in the app.
 */
export function cancelActiveDialog(root: ParentNode = document): boolean {
  const dialogs = Array.from(root.querySelectorAll<HTMLElement>('.van-dialog'))
  for (let index = dialogs.length - 1; index >= 0; index -= 1) {
    const dialog = dialogs[index]
    if (!dialog || window.getComputedStyle(dialog).display === 'none') continue
    const cancel = dialog.querySelector<HTMLButtonElement>('.van-dialog__cancel')
    if (!cancel) continue
    cancel.click()
    return true
  }
  return false
}
