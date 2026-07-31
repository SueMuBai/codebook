import type { AppSettings, VaultRecord } from '@/types/domain'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'
import type { DatabaseAdapter } from './DatabaseAdapter'
import { LegacyVaultError } from './DatabaseAdapter'
import { SerialTaskQueue } from './SerialTaskQueue'

const DB_NAME = 'codebook_app_v1'
const DB_VERSION = 1
const STORE = 'kv'

const KEYS = {
  vaultRecord: 'vault_record_v2',
  settings: 'settings_v2',
  legacyMeta: 'vault_meta',
  legacyCipher: 'vault_cipher',
  legacySettings: 'settings',
} as const

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务已回滚'))
  })
}

export class IndexedDbAdapter implements DatabaseAdapter {
  private db: IDBDatabase | null = null
  private readonly queue = new SerialTaskQueue()

  async initialize(): Promise<void> {
    if (!this.db) this.db = await openIndexedDb()
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error('IndexedDbAdapter 尚未初始化')
    return this.db
  }

  private async getRaw(key: string): Promise<string | null> {
    const tx = this.requireDb().transaction(STORE, 'readonly')
    const value = await requestResult(tx.objectStore(STORE).get(key))
    await transactionDone(tx)
    if (value == null) return null
    if (typeof value !== 'string') throw new Error(`IndexedDB ${key} 数据类型无效`)
    return value
  }

  private async putMany(entries: Record<string, string | null>): Promise<void> {
    const tx = this.requireDb().transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) store.delete(key)
      else store.put(value, key)
    }
    await transactionDone(tx)
  }

  async getVaultRecord(): Promise<VaultRecord | null> {
    return this.queue.run(async () => {
      const raw = await this.getRaw(KEYS.vaultRecord)
      if (raw) return JSON.parse(raw) as VaultRecord
      const legacyMeta = await this.getRaw(KEYS.legacyMeta)
      const legacyCipher = await this.getRaw(KEYS.legacyCipher)
      if (legacyMeta || legacyCipher) throw new LegacyVaultError()
      return null
    })
  }

  async saveVaultRecord(record: VaultRecord): Promise<void> {
    return this.queue.run(() => this.putMany({ [KEYS.vaultRecord]: JSON.stringify(record) }))
  }

  async getSettings(): Promise<AppSettings> {
    return this.queue.run(async () => {
      const raw = await this.getRaw(KEYS.settings)
      return raw ? (JSON.parse(raw) as AppSettings) : { ...DEFAULT_APP_SETTINGS }
    })
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return this.queue.run(() => this.putMany({ [KEYS.settings]: JSON.stringify(settings) }))
  }

  async replaceAll(record: VaultRecord, settings: AppSettings): Promise<void> {
    return this.queue.run(() =>
      this.putMany({
        [KEYS.vaultRecord]: JSON.stringify(record),
        [KEYS.settings]: JSON.stringify(settings),
      }),
    )
  }

  async clearLocalData(): Promise<void> {
    return this.queue.run(() =>
      this.putMany({
        [KEYS.vaultRecord]: null,
        [KEYS.settings]: null,
        [KEYS.legacyMeta]: null,
        [KEYS.legacyCipher]: null,
        [KEYS.legacySettings]: null,
      }),
    )
  }
}
