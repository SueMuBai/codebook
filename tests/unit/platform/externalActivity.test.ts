import { describe, expect, it } from 'vitest'
import {
  isExternalActivityActive,
  runExternalActivity,
} from '@/services/platform/externalActivity'

describe('trusted external activity state', () => {
  it('stays active until the system operation settles', async () => {
    let finish!: () => void
    const operation = runExternalActivity(
      () => new Promise<void>((resolve) => {
        finish = resolve
      }),
    )

    expect(isExternalActivityActive()).toBe(true)
    finish()
    await operation
    expect(isExternalActivityActive()).toBe(false)
  })

  it('clears the state when the operation rejects', async () => {
    await expect(
      runExternalActivity(() => Promise.reject(new Error('cancelled'))),
    ).rejects.toThrow('cancelled')
    expect(isExternalActivityActive()).toBe(false)
  })
})
