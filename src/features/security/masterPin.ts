import type { VaultRecord } from '@/types/domain'

export const MASTER_PIN_LENGTH = 6
export const MASTER_PIN_ERROR = '主 PIN 必须为 6 位数字'

export function isMasterPin(value: string): boolean {
  return /^\d{6}$/.test(value)
}

export function normalizeMasterPinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, MASTER_PIN_LENGTH)
}

export function assertMasterPin(value: string): void {
  if (!isMasterPin(value)) throw new Error(MASTER_PIN_ERROR)
}

export function vaultUsesMasterPin(record: VaultRecord | null | undefined): boolean {
  return record?.meta.credentialType === 'pin'
}

export function markVaultAsPinProtected(record: VaultRecord): VaultRecord {
  return {
    ...record,
    meta: { ...record.meta, credentialType: 'pin' },
  }
}
