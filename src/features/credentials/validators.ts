import type { CredentialEntry } from '@/types/domain'

export function validateEntryDraft(draft: Partial<CredentialEntry>): string | null {
  const title = draft.title?.trim() ?? ''
  if (!title) return '请填写标题'
  if (title.length > 120) return '标题不能超过 120 个字符'
  if ((draft.url?.length ?? 0) > 2_000) return '网址过长'
  if ((draft.username?.length ?? 0) > 500) return '账号过长'
  if ((draft.password?.length ?? 0) > 2_000) return '密码过长'
  if ((draft.notes?.length ?? 0) > 20_000) return '备注过长'

  const customNames = new Set<string>()
  for (const field of draft.customFields ?? []) {
    const name = field.name.trim()
    if (!name) return '自定义字段名称不能为空'
    if (customNames.has(name)) return `自定义字段“${name}”重复`
    customNames.add(name)
  }

  return null
}
