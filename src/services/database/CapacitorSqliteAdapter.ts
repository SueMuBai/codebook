import type { AppSettings, VaultRecord } from '@/types/domain'
import type { SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'
import type { DatabaseAdapter } from './DatabaseAdapter'
import { LegacyVaultError } from './DatabaseAdapter'
import { SerialTaskQueue } from './SerialTaskQueue'
import { DATABASE_NAME, DATABASE_VERSION, KV_KEYS, NATIVE_SCHEMA } from './schema'

export class CapacitorSqliteAdapter implements DatabaseAdapter {
  private ready = false
  private manager: SQLiteConnection | null = null
  private connection: SQLiteDBConnection | null = null
  private readonly queue = new SerialTaskQueue()

  /**
   * Capacitor plugin proxies expose arbitrary property names as native methods,
   * including `then`. Returning one directly from an async function makes the
   * Promise resolution algorithm treat it as a thenable and invoke a nonexistent
   * native `CapacitorSQLite.then()` method. Initialize the proxy in-place instead.
   */
  private async ensurePlugin(): Promise<void> {
    if (!this.manager) {
      const module = await import('@capacitor-community/sqlite')
      this.manager = new module.SQLiteConnection(module.CapacitorSQLite)
    }
  }

  async initialize(): Promise<void> {
    if (this.ready) return
    await this.ensurePlugin()
    const manager = this.requireManager()
    await manager.checkConnectionsConsistency()
    const connected = (await manager.isConnection(DATABASE_NAME, false)).result
    this.connection = connected
      ? await manager.retrieveConnection(DATABASE_NAME, false)
      : await manager.createConnection(
          DATABASE_NAME,
          false,
          'no-encryption',
          DATABASE_VERSION,
          false,
        )
    await this.connection.open()
    await this.connection.execute(NATIVE_SCHEMA, true)
    this.ready = true
  }

  async close(): Promise<void> {
    if (this.ready && this.manager) {
      await this.manager.closeConnection(DATABASE_NAME, false)
    }
    this.ready = false
    this.connection = null
  }

  private requireReady(): SQLiteDBConnection {
    if (!this.ready || !this.connection) throw new Error('CapacitorSqliteAdapter 尚未初始化')
    return this.connection
  }

  private requireManager(): SQLiteConnection {
    if (!this.manager) throw new Error('Capacitor SQLite 插件尚未加载')
    return this.manager
  }

  private async getRaw(key: string): Promise<string | null> {
    const result = await this.requireReady().query('SELECT value FROM kv WHERE key = ?', [key])
    const value = result.values?.[0]?.value
    return typeof value === 'string' ? value : null
  }

  private async putRaw(key: string, value: string): Promise<void> {
    await this.requireReady().run(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      [key, value],
      true,
    )
  }

  async getVaultRecord(): Promise<VaultRecord | null> {
    return this.queue.run(async () => {
      const raw = await this.getRaw(KV_KEYS.vaultRecord)
      if (raw) return JSON.parse(raw) as VaultRecord
      if ((await this.getRaw(KV_KEYS.legacyMeta)) || (await this.getRaw(KV_KEYS.legacyCipher))) {
        throw new LegacyVaultError()
      }
      return null
    })
  }

  async saveVaultRecord(record: VaultRecord): Promise<void> {
    return this.queue.run(() => this.putRaw(KV_KEYS.vaultRecord, JSON.stringify(record)))
  }

  async getSettings(): Promise<AppSettings> {
    return this.queue.run(async () => {
      const raw = await this.getRaw(KV_KEYS.settings)
      return raw ? (JSON.parse(raw) as AppSettings) : { ...DEFAULT_APP_SETTINGS }
    })
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return this.queue.run(() => this.putRaw(KV_KEYS.settings, JSON.stringify(settings)))
  }

  async replaceAll(record: VaultRecord, settings: AppSettings): Promise<void> {
    return this.queue.run(async () => {
      const statement = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)'
      await this.requireReady().executeSet(
        [
          { statement, values: [KV_KEYS.vaultRecord, JSON.stringify(record)] },
          { statement, values: [KV_KEYS.settings, JSON.stringify(settings)] },
        ],
        true,
      )
    })
  }

  async clearLocalData(): Promise<void> {
    return this.queue.run(async () => {
      const keys = Object.values(KV_KEYS)
      const placeholders = keys.map(() => '?').join(',')
      await this.requireReady().run(
        `DELETE FROM kv WHERE key IN (${placeholders})`,
        keys,
        true,
      )
    })
  }
}
