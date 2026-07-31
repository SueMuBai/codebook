import { describe, expect, it } from 'vitest'
import {
  MASTER_PIN_ERROR,
  assertMasterPin,
  isMasterPin,
  normalizeMasterPinInput,
  vaultUsesMasterPin,
} from '@/features/security'
import type { VaultRecord } from '@/types/domain'

describe('master PIN validation', () => {
  it('accepts exactly six ASCII digits', () => {
    expect(isMasterPin('012345')).toBe(true)
    expect(isMasterPin('12345')).toBe(false)
    expect(isMasterPin('1234567')).toBe(false)
    expect(isMasterPin('12a456')).toBe(false)
    expect(isMasterPin('１２３４５６')).toBe(false)
    expect(() => assertMasterPin('12a456')).toThrow(MASTER_PIN_ERROR)
  })

  it('normalizes pasted input for numeric PIN fields', () => {
    expect(normalizeMasterPinInput(' 12a34-5678 ')).toBe('123456')
  })

  it('treats records without a credential marker as legacy passwords', () => {
    const record = { meta: {} } as VaultRecord
    expect(vaultUsesMasterPin(record)).toBe(false)
    expect(vaultUsesMasterPin({ meta: { credentialType: 'pin' } } as VaultRecord)).toBe(true)
  })
})
