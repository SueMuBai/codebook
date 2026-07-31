import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelActiveDialog } from '@/services/navigation/dialogBack'

describe('dialog back handling', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks cancel on the top-most visible Vant dialog', () => {
    document.body.innerHTML = `
      <div class="van-dialog" style="display: none">
        <button class="van-dialog__cancel">hidden</button>
      </div>
      <div class="van-dialog">
        <button class="van-dialog__cancel">visible</button>
      </div>
    `
    const buttons = document.querySelectorAll<HTMLButtonElement>('.van-dialog__cancel')
    const hiddenClick = vi.spyOn(buttons[0]!, 'click')
    const visibleClick = vi.spyOn(buttons[1]!, 'click')

    expect(cancelActiveDialog()).toBe(true)
    expect(hiddenClick).not.toHaveBeenCalled()
    expect(visibleClick).toHaveBeenCalledOnce()
  })

  it('does not consume back when no cancellable dialog is visible', () => {
    document.body.innerHTML = '<div class="van-dialog" style="display: none"></div>'

    expect(cancelActiveDialog()).toBe(false)
  })
})
