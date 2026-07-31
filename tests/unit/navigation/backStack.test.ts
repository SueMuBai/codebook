import { describe, expect, it } from 'vitest'
import { dispatchBackHandler, registerBackHandler } from '@/services/navigation/backStack'

describe('back handler stack', () => {
  it('dispatches the most recently registered overlay first', async () => {
    const calls: string[] = []
    const removeFirst = registerBackHandler(() => {
      calls.push('first')
      return true
    })
    const removeSecond = registerBackHandler(() => {
      calls.push('second')
      return true
    })

    expect(await dispatchBackHandler()).toBe(true)
    expect(calls).toEqual(['second'])
    removeSecond()
    expect(await dispatchBackHandler()).toBe(true)
    expect(calls).toEqual(['second', 'first'])
    removeFirst()
  })
})
