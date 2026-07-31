import { computed } from 'vue'
import { defineStore } from 'pinia'
import {
  findReferencingEntries,
  removeEntryAndConvertReferences,
  searchEntries,
  validateEntryDraft,
} from '@/features/credentials'
import type { CsvEntryDraft } from '@/features/export'
import type {
  Category,
  CredentialEntry,
  LinkedEmailRef,
  TotpSecret,
} from '@/types/domain'
import { createId } from '@/utils/id'
import { useSessionStore } from './session'

export const useVaultStore = defineStore('vault', () => {
  const session = useSessionStore()

  const entries = computed(() => session.payload?.entries ?? [])
  const categories = computed(() =>
    [...(session.payload?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  )

  function requirePayload() {
    if (!session.payload || !session.isUnlocked) throw new Error('请先解锁保险箱')
    return session.payload
  }

  function listEntries(query = '', categoryId?: string | null): CredentialEntry[] {
    return session.payload ? searchEntries(session.payload, query, categoryId) : []
  }

  function getEntry(id: string): CredentialEntry | undefined {
    return session.payload?.entries.find((entry) => entry.id === id)
  }

  function getCategory(id: string | undefined): Category | undefined {
    return id ? session.payload?.categories.find((category) => category.id === id) : undefined
  }

  async function upsertEntry(draft: Partial<CredentialEntry> & { title: string }): Promise<CredentialEntry> {
    const payload = requirePayload()
    const validationError = validateEntryDraft(draft)
    if (validationError) throw new Error(validationError)
    const now = Date.now()
    const existing = draft.id ? getEntry(draft.id) : undefined
    const entry: CredentialEntry = {
      id: existing?.id ?? createId('entry'),
      categoryId: draft.categoryId || undefined,
      title: draft.title.trim(),
      url: draft.url?.trim() || undefined,
      username: draft.username?.trim() || undefined,
      password: draft.password || undefined,
      notes: draft.notes?.trim() || undefined,
      favorite: draft.favorite ?? existing?.favorite ?? false,
      totp: draft.totp ?? existing?.totp ?? [],
      linkedEmails: draft.linkedEmails ?? existing?.linkedEmails ?? [],
      customFields: draft.customFields ?? existing?.customFields ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastUsedAt: draft.lastUsedAt ?? existing?.lastUsedAt,
    }
    await session.savePayload({
      ...payload,
      entries: existing
        ? payload.entries.map((item) => (item.id === entry.id ? entry : item))
        : [...payload.entries, entry],
    })
    return entry
  }

  async function deleteEntry(id: string): Promise<void> {
    await session.savePayload(removeEntryAndConvertReferences(requirePayload(), id))
  }

  async function upsertCategory(draft: Partial<Category> & { name: string }): Promise<Category> {
    const payload = requirePayload()
    const name = draft.name.trim()
    if (!name) throw new Error('分类名称不能为空')
    if (name.length > 40) throw new Error('分类名称不能超过 40 个字符')
    const duplicate = payload.categories.find(
      (item) => item.id !== draft.id && item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'),
    )
    if (duplicate) throw new Error('分类名称已存在')
    const existing = draft.id ? payload.categories.find((item) => item.id === draft.id) : undefined
    const category: Category = {
      id: existing?.id ?? createId('category'),
      name,
      color: draft.color || existing?.color,
      sortOrder: draft.sortOrder ?? existing?.sortOrder ?? payload.categories.length,
    }
    await session.savePayload({
      ...payload,
      categories: existing
        ? payload.categories.map((item) => (item.id === category.id ? category : item))
        : [...payload.categories, category],
    })
    return category
  }

  async function deleteCategory(id: string): Promise<void> {
    const payload = requirePayload()
    await session.savePayload({
      ...payload,
      categories: payload.categories.filter((item) => item.id !== id),
      entries: payload.entries.map((entry) =>
        entry.categoryId === id ? { ...entry, categoryId: undefined } : entry,
      ),
    })
  }

  async function reorderCategories(ids: string[]): Promise<void> {
    const payload = requirePayload()
    if (ids.length !== payload.categories.length) throw new Error('分类顺序不完整')
    const order = new Map(ids.map((id, index) => [id, index]))
    await session.savePayload({
      ...payload,
      categories: payload.categories.map((category) => ({
        ...category,
        sortOrder: order.get(category.id) ?? category.sortOrder,
      })),
    })
  }

  function referencing(entryId: string): CredentialEntry[] {
    return session.payload ? findReferencingEntries(session.payload, entryId) : []
  }

  function createEntryLink(entryId: string): LinkedEmailRef {
    const target = getEntry(entryId)
    if (!target) throw new Error('关联条目不存在')
    return {
      kind: 'entry',
      entryId,
      labelSnapshot: target.title,
      emailSnapshot: target.username,
    }
  }

  async function importCsvEntries(drafts: CsvEntryDraft[]): Promise<number> {
    const payload = requirePayload()
    for (const draft of drafts) {
      const validationError = validateEntryDraft(draft)
      if (validationError) throw new Error(validationError)
      if ((draft.categoryName?.length ?? 0) > 40) throw new Error('分类名称不能超过 40 个字符')
    }
    const now = Date.now()
    const categoriesNext = [...payload.categories]
    const categoryByName = new Map(
      categoriesNext.map((item) => [item.name.toLocaleLowerCase('zh-CN'), item]),
    )
    const imported = drafts.map((draft): CredentialEntry => {
      let categoryId: string | undefined
      if (draft.categoryName) {
        const key = draft.categoryName.toLocaleLowerCase('zh-CN')
        let category = categoryByName.get(key)
        if (!category) {
          category = {
            id: createId('category'),
            name: draft.categoryName,
            sortOrder: categoriesNext.length,
          }
          categoriesNext.push(category)
          categoryByName.set(key, category)
        }
        categoryId = category.id
      }
      return {
        id: createId('entry'),
        categoryId,
        title: draft.title.trim(),
        url: draft.url,
        username: draft.username,
        password: draft.password,
        notes: draft.notes,
        favorite: draft.favorite,
        totp: [],
        linkedEmails: [],
        customFields: [],
        createdAt: now,
        updatedAt: now,
      }
    })
    await session.savePayload({
      ...payload,
      categories: categoriesNext,
      entries: [...payload.entries, ...imported],
    })
    return imported.length
  }

  async function setEntryTotp(entryId: string, totp: TotpSecret[]): Promise<void> {
    const entry = getEntry(entryId)
    if (!entry) throw new Error('条目不存在')
    await upsertEntry({ ...entry, totp })
  }

  async function markEntryUsed(entryId: string, usedAt: number = Date.now()): Promise<void> {
    const payload = requirePayload()
    const entry = payload.entries.find((item) => item.id === entryId)
    if (!entry) throw new Error('条目不存在')
    if (!Number.isSafeInteger(usedAt) || usedAt < 0) throw new Error('最近使用时间无效')
    await session.savePayload({
      ...payload,
      entries: payload.entries.map((item) =>
        item.id === entryId ? { ...item, lastUsedAt: usedAt } : item,
      ),
    })
  }

  return {
    entries,
    categories,
    listEntries,
    getEntry,
    getCategory,
    upsertEntry,
    deleteEntry,
    upsertCategory,
    deleteCategory,
    reorderCategories,
    referencing,
    createEntryLink,
    importCsvEntries,
    setEntryTotp,
    markEntryUsed,
  }
})
