import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const nativePlugin = {
    then: vi.fn(() => {
      throw new Error('CapacitorSQLite.then() must never be called')
    }),
    isConnection: vi.fn(() => {
      throw new Error('raw CapacitorSQLite.isConnection() must never be called')
    }),
  }
  const connection = {
    open: vi.fn(async () => undefined),
    execute: vi.fn(async () => ({})),
    run: vi.fn(async () => ({})),
    query: vi.fn(async () => ({ values: [] })),
    executeSet: vi.fn(async () => ({})),
  }
  const manager = {
    checkConnectionsConsistency: vi.fn(async () => ({ result: true })),
    isConnection: vi.fn(async () => ({ result: false })),
    createConnection: vi.fn(async () => connection),
    retrieveConnection: vi.fn(async () => connection),
    closeConnection: vi.fn(async () => undefined),
  }
  const SQLiteConnection = vi.fn(function () {
    return manager
  })
  return { nativePlugin, connection, manager, SQLiteConnection }
})

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: mocks.nativePlugin,
  SQLiteConnection: mocks.SQLiteConnection,
}))

import { CapacitorSqliteAdapter } from '@/services/database/CapacitorSqliteAdapter'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'

describe('CapacitorSqliteAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.manager.isConnection.mockResolvedValue({ result: false })
  })

  it('uses the connection wrapper without assimilating or calling raw proxy methods', async () => {
    const adapter = new CapacitorSqliteAdapter()

    await expect(adapter.initialize()).resolves.toBeUndefined()

    expect(mocks.SQLiteConnection).toHaveBeenCalledWith(mocks.nativePlugin)
    expect(mocks.nativePlugin.then).not.toHaveBeenCalled()
    expect(mocks.nativePlugin.isConnection).not.toHaveBeenCalled()
    expect(mocks.manager.checkConnectionsConsistency).toHaveBeenCalledWith()
    expect(mocks.manager.isConnection).toHaveBeenCalledWith('codebook_vault', false)
    expect(mocks.manager.createConnection).toHaveBeenCalledWith(
      'codebook_vault',
      false,
      'no-encryption',
      1,
      false,
    )
    expect(mocks.connection.open).toHaveBeenCalledWith()
    expect(mocks.connection.execute).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'), true)

    await adapter.close()
    expect(mocks.manager.closeConnection).toHaveBeenCalledWith('codebook_vault', false)
  })

  it('retrieves an existing wrapper connection instead of creating another one', async () => {
    mocks.manager.isConnection.mockResolvedValue({ result: true })
    const adapter = new CapacitorSqliteAdapter()

    await adapter.initialize()

    expect(mocks.manager.retrieveConnection).toHaveBeenCalledWith('codebook_vault', false)
    expect(mocks.manager.createConnection).not.toHaveBeenCalled()
  })

  it('uses transactional native writes for vault replacement and data reset', async () => {
    const adapter = new CapacitorSqliteAdapter()
    await adapter.initialize()
    const record = {
      meta: {
        version: 2 as const,
        kdf: {
          algorithm: 'PBKDF2' as const,
          hash: 'SHA-256' as const,
          iterations: 600_000,
          saltB64: 'AAAAAAAAAAAAAAAAAAAAAA==',
        },
        wrappedDek: {
          ivB64: 'AAAAAAAAAAAAAAAA',
          ciphertextB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        createdAt: 1,
        updatedAt: 1,
      },
      cipher: {
        ivB64: 'AAAAAAAAAAAAAAAA',
        ciphertextB64: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
    }

    await adapter.saveVaultRecord(record)
    expect(mocks.connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE'),
      expect.any(Array),
      true,
    )

    await adapter.replaceAll(record, DEFAULT_APP_SETTINGS)
    expect(mocks.connection.executeSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ values: ['vault_record_v2', JSON.stringify(record)] }),
        expect.objectContaining({ values: ['settings_v2', JSON.stringify(DEFAULT_APP_SETTINGS)] }),
      ]),
      true,
    )

    await adapter.clearLocalData()
    expect(mocks.connection.run).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM kv'),
      expect.arrayContaining(['vault_record_v2', 'settings_v2', 'vault_meta', 'vault_cipher']),
      true,
    )
  })
})
