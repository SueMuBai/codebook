import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createVault, persistPayload, unlockVault } from '@/features/crypto'
import {
  buildEncryptedPackage,
  entriesToCsv,
  parseCsvEntries,
  parseEncryptedPackage,
} from '@/features/export'
import type { CredentialEntry, VaultPayload } from '@/types/domain'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

describe('v2 export package', () => {
  it('strictly round-trips a valid package', async () => {
    const created = await createVault('backup-password', { iterations: 100_000 })
    const pkg = buildEncryptedPackage({ vault: created.record, exportedAt: 123 })
    expect(parseEncryptedPackage(JSON.stringify(pkg))).toEqual(pkg)
  })

  it('rejects v1 and malformed packages', () => {
    expect(() =>
      parseEncryptedPackage(JSON.stringify({ format: 'codebook-encrypted', packageVersion: 1 })),
    ).toThrow('不支持的备份版本')
    expect(() => parseEncryptedPackage('{')).toThrow('有效 JSON')
    expect(() =>
      parseEncryptedPackage(
        JSON.stringify({
          format: 'codebook-encrypted',
          packageVersion: 2,
          exportedAt: 1,
          vault: {},
          settings: null,
        }),
      ),
    ).toThrow()
  })

  it('exports category while keeping CSV deliberately lossy', () => {
    const entry: CredentialEntry = {
      id: 'entry',
      categoryId: 'category',
      title: 'Demo',
      username: 'user',
      password: 'p,ass',
      notes: 'line 1\nline 2',
      favorite: true,
      totp: [],
      linkedEmails: [],
      customFields: [],
      createdAt: 1,
      updatedAt: 1,
    }
    const csv = entriesToCsv([entry], [{ id: 'category', name: '工作', sortOrder: 0 }])
    const parsed = parseCsvEntries(csv)
    expect(parsed.skipped).toBe(0)
    expect(parsed.entries[0]).toMatchObject({
      title: 'Demo',
      password: 'p,ass',
      notes: 'line 1\nline 2',
      categoryName: '工作',
    })
  })

  it('counts rows without a title as skipped', () => {
    const parsed = parseCsvEntries('title,username\n,missing\nValid,user')
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
    expect(parsed.failed).toBe(0)
  })

  it('rejects illegal CSV rows and reports them as failed', () => {
    const parsed = parseCsvEntries(`title,category\n${'x'.repeat(121)},work\nValid,${'y'.repeat(41)}`)
    expect(parsed.entries).toHaveLength(0)
    expect(parsed.skipped).toBe(0)
    expect(parsed.failed).toBe(2)
    expect(() => parseCsvEntries('title,notes\nDemo,"unterminated')).toThrow('引号未闭合')
  })

  it('round-trips every domain collection in an encrypted backup', async () => {
    const created = await createVault('backup-password', { iterations: 100_000, now: 1 })
    const payload: VaultPayload = {
      schemaVersion: 2,
      categories: [{ id: 'category', name: '工作', color: '#668cff', sortOrder: 0 }],
      entries: [
        {
          id: 'mail',
          title: '邮箱',
          username: 'mail@example.com',
          favorite: false,
          totp: [],
          linkedEmails: [],
          customFields: [],
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'entry',
          categoryId: 'category',
          title: '完整条目',
          url: 'https://example.com',
          username: 'alice',
          password: 'secret',
          notes: 'note',
          favorite: true,
          totp: [
            {
              id: 'totp',
              secret: 'JBSWY3DPEHPK3PXP',
              issuer: 'Example',
              accountName: 'alice',
              label: '主账号',
              digits: 8,
              period: 45,
              algorithm: 'SHA256',
            },
          ],
          linkedEmails: [
            {
              kind: 'entry',
              entryId: 'mail',
              labelSnapshot: '邮箱',
              emailSnapshot: 'mail@example.com',
            },
            { kind: 'text', email: 'backup@example.com', note: '备用' },
          ],
          customFields: [{ id: 'field', name: '恢复码', value: 'ABC-123', masked: true }],
          createdAt: 2,
          updatedAt: 3,
          lastUsedAt: 4,
        },
      ],
    }
    const record = await persistPayload(created.dek, created.record, payload, 5)
    const pkg = buildEncryptedPackage({
      vault: record,
      exportedAt: 6,
      settings: {
        autoLockSeconds: 30,
        clipboardClearSeconds: 15,
        theme: 'dark',
        totpRevealSeconds: 10,
      },
    })
    const parsed = parseEncryptedPackage(JSON.stringify(pkg))
    expect((await unlockVault('backup-password', parsed.vault)).payload).toEqual(payload)
    expect(parsed.settings).toEqual(pkg.settings)
  })
})
