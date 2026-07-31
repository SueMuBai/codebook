import type { CredentialEntry, VaultPayload } from '@/types/domain'

export const UNCATEGORIZED_FILTER = '__uncategorized__'

export function searchEntries(
  payload: VaultPayload,
  query: string,
  categoryId?: string | null,
): CredentialEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  let entries = payload.entries

  if (categoryId === UNCATEGORIZED_FILTER) {
    entries = entries.filter((entry) => !entry.categoryId)
  } else if (categoryId) {
    entries = entries.filter((entry) => entry.categoryId === categoryId)
  }

  if (normalizedQuery) {
    entries = entries.filter((entry) => {
      const searchable = [
        entry.title,
        entry.username,
        entry.url,
        entry.notes,
        ...entry.totp.flatMap((item) => [item.issuer, item.accountName, item.label]),
        ...entry.linkedEmails.flatMap((ref) =>
          ref.kind === 'text'
            ? [ref.email, ref.note]
            : [ref.labelSnapshot, ref.emailSnapshot],
        ),
        ...entry.customFields.flatMap((field) => [field.name, field.value]),
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLocaleLowerCase('zh-CN')
      return searchable.includes(normalizedQuery)
    })
  }

  return [...entries].sort((left, right) => {
    if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}
