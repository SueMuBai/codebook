import { describe, expect, it } from 'vitest'
import {
  findReferencingEntries,
  removeEntryAndConvertReferences,
  searchEntries,
  UNCATEGORIZED_FILTER,
} from '@/features/credentials'
import type { VaultPayload } from '@/types/domain'

const payload: VaultPayload = {
  schemaVersion: 2,
  categories: [{ id: 'work', name: '工作', sortOrder: 0 }],
  entries: [
    {
      id: 'mail',
      title: 'Gmail',
      username: 'foo@gmail.com',
      favorite: false,
      totp: [],
      linkedEmails: [],
      customFields: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'site',
      categoryId: 'work',
      title: 'GitHub',
      username: 'dev',
      url: 'https://github.com',
      notes: 'work',
      favorite: true,
      totp: [
        {
          id: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
          issuer: 'GitHub',
        },
      ],
      linkedEmails: [
        {
          kind: 'entry',
          entryId: 'mail',
          labelSnapshot: 'Gmail',
          emailSnapshot: 'foo@gmail.com',
        },
      ],
      customFields: [{ id: 'field', name: '恢复码', value: 'ABC-123', masked: true }],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

describe('credential domain helpers', () => {
  it('searches standard, TOTP, link and custom fields', () => {
    expect(searchEntries(payload, 'github').map((item) => item.id)).toEqual(['site'])
    expect(searchEntries(payload, 'foo@').map((item) => item.id)).toEqual(['site', 'mail'])
    expect(searchEntries(payload, 'ABC-123').map((item) => item.id)).toEqual(['site'])
  })

  it('filters by category and uncategorized state', () => {
    expect(searchEntries(payload, '', 'work').map((item) => item.id)).toEqual(['site'])
    expect(searchEntries(payload, '', UNCATEGORIZED_FILTER).map((item) => item.id)).toEqual(['mail'])
  })

  it('finds reverse references', () => {
    expect(findReferencingEntries(payload, 'mail').map((item) => item.id)).toEqual(['site'])
  })

  it('converts inbound references to text in the same payload update', () => {
    const next = removeEntryAndConvertReferences(payload, 'mail')
    expect(next.entries.map((item) => item.id)).toEqual(['site'])
    expect(next.entries[0]!.linkedEmails).toEqual([
      { kind: 'text', email: 'foo@gmail.com', note: '原关联记录已删除' },
    ])
  })

  it('falls back from emailSnapshot directly to labelSnapshot', () => {
    const withoutEmailSnapshot: VaultPayload = {
      ...payload,
      entries: payload.entries.map((entry) =>
        entry.id === 'site'
          ? {
              ...entry,
              linkedEmails: [{ kind: 'entry', entryId: 'mail', labelSnapshot: '邮箱身份' }],
            }
          : entry,
      ),
    }
    expect(removeEntryAndConvertReferences(withoutEmailSnapshot, 'mail').entries[0]!.linkedEmails)
      .toEqual([{ kind: 'text', email: '邮箱身份', note: '原关联记录已删除' }])
  })
})
