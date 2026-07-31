import type { AppSettings, VaultRecord } from '@/types/domain'

export class LegacyVaultError extends Error {
  readonly version: number

  constructor(version = 1) {
    super(`检测到不兼容的开发期 v${version} 保险箱`)
    this.name = 'LegacyVaultError'
    this.version = version
  }
}

export interface DatabaseAdapter {
  initialize(): Promise<void>
  close(): Promise<void>
  getVaultRecord(): Promise<VaultRecord | null>
  saveVaultRecord(record: VaultRecord): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  replaceAll(record: VaultRecord, settings: AppSettings): Promise<void>
  clearLocalData(): Promise<void>
}
