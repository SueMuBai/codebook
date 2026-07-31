import { describe, expect, it } from 'vitest'
import { normalizeVaultPayload } from '@/features/vault'

describe('vault payload normalization', () => {
  it('accepts a complete v2 payload', () => {
    const payload = {
      schemaVersion: 2,
      categories: [{ id: 'category', name: '工作', sortOrder: 0 }],
      entries: [
        {
          id: 'entry',
          categoryId: 'category',
          title: 'Example',
          favorite: false,
          totp: [],
          linkedEmails: [],
          customFields: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    expect(normalizeVaultPayload(payload)).toEqual(payload)
  })

  it('rejects optional legacy collections and dangling category ids', () => {
    expect(() =>
      normalizeVaultPayload({
        schemaVersion: 2,
        categories: [],
        entries: [{ id: 'entry', title: 'Legacy', favorite: false, createdAt: 1, updatedAt: 1 }],
      }),
    ).toThrow('必须是数组')

    expect(() =>
      normalizeVaultPayload({
        schemaVersion: 2,
        categories: [],
        entries: [
          {
            id: 'entry',
            categoryId: 'missing',
            title: 'Invalid',
            favorite: false,
            totp: [],
            linkedEmails: [],
            customFields: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    ).toThrow('不存在的分类')
  })

  it('rejects invalid timestamps and duplicate nested ids', () => {
    const entry = {
      id: 'entry',
      title: 'Example',
      favorite: false,
      totp: [
        {
          id: 'same',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
        },
        {
          id: 'same',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
        },
      ],
      linkedEmails: [],
      customFields: [],
      createdAt: 2,
      updatedAt: 1,
    }
    expect(() =>
      normalizeVaultPayload({ schemaVersion: 2, categories: [], entries: [entry] }),
    ).toThrow('更新时间')
    expect(() =>
      normalizeVaultPayload({
        schemaVersion: 2,
        categories: [],
        entries: [{ ...entry, updatedAt: 2 }],
      }),
    ).toThrow('TOTP id 重复')
  })
})
