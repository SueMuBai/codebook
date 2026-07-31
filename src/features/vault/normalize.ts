import { PAYLOAD_SCHEMA_VERSION } from '@/features/crypto/constants'
import { base32Decode } from '@/features/totp/base32'
import type {
  Category,
  CredentialEntry,
  CustomField,
  LinkedEmailRef,
  TotpAlgorithm,
  TotpDigits,
  TotpSecret,
  VaultPayload,
} from '@/types/domain'

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, required = false): string | undefined {
  if (value == null || value === '') {
    if (required) throw new Error(`${label} 不能为空`)
    return undefined
  }
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  if (required && !value.trim()) throw new Error(`${label} 不能为空`)
  return value
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数字`)
  }
  return value
}

function timestampValue(value: unknown, label: string): number {
  const timestamp = numberValue(value, label)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error(`${label} 无效`)
  return timestamp
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值`)
  return value
}

function normalizeCategory(value: unknown): Category {
  const item = record(value, '分类')
  return {
    id: stringValue(item.id, '分类 id', true)!,
    name: stringValue(item.name, '分类名称', true)!.trim(),
    color: stringValue(item.color, '分类颜色'),
    sortOrder: timestampValue(item.sortOrder, '分类顺序'),
  }
}

function normalizeTotp(value: unknown): TotpSecret {
  const item = record(value, 'TOTP')
  const secret = stringValue(item.secret, 'TOTP secret', true)!.replace(/\s+/g, '').toUpperCase()
  if (base32Decode(secret).byteLength === 0) throw new Error('TOTP secret 不是有效 Base32')

  const digits = numberValue(item.digits, 'TOTP 位数')
  if (digits !== 6 && digits !== 7 && digits !== 8) throw new Error('TOTP 位数不受支持')

  const period = numberValue(item.period, 'TOTP 周期')
  if (!Number.isInteger(period) || period <= 0 || period > 300) {
    throw new Error('TOTP 周期必须是 1–300 秒的整数')
  }

  const algorithm = stringValue(item.algorithm, 'TOTP 算法', true)
  if (algorithm !== 'SHA1' && algorithm !== 'SHA256' && algorithm !== 'SHA512') {
    throw new Error('TOTP 算法不受支持')
  }

  return {
    id: stringValue(item.id, 'TOTP id', true)!,
    secret,
    issuer: stringValue(item.issuer, 'TOTP issuer'),
    accountName: stringValue(item.accountName, 'TOTP 账号'),
    label: stringValue(item.label, 'TOTP 标签'),
    digits: digits as TotpDigits,
    period,
    algorithm: algorithm as TotpAlgorithm,
  }
}

function normalizeLinkedEmail(value: unknown): LinkedEmailRef {
  const item = record(value, '邮箱关联')
  if (item.kind === 'entry') {
    return {
      kind: 'entry',
      entryId: stringValue(item.entryId, '关联条目 id', true)!,
      labelSnapshot: stringValue(item.labelSnapshot, '关联显示快照', true)!,
      emailSnapshot: stringValue(item.emailSnapshot, '关联邮箱快照'),
    }
  }
  if (item.kind === 'text') {
    return {
      kind: 'text',
      email: stringValue(item.email, '邮箱', true)!,
      note: stringValue(item.note, '邮箱备注'),
    }
  }
  throw new Error('邮箱关联类型无效')
}

function normalizeCustomField(value: unknown): CustomField {
  const item = record(value, '自定义字段')
  return {
    id: stringValue(item.id, '自定义字段 id', true)!,
    name: stringValue(item.name, '自定义字段名称', true)!.trim(),
    value: stringValue(item.value, '自定义字段值') ?? '',
    masked: booleanValue(item.masked, '自定义字段遮罩状态'),
  }
}

function normalizeEntry(value: unknown): CredentialEntry {
  const item = record(value, '条目')
  if (!Array.isArray(item.totp) || !Array.isArray(item.linkedEmails) || !Array.isArray(item.customFields)) {
    throw new Error('条目的 totp、linkedEmails、customFields 必须是数组')
  }

  const createdAt = timestampValue(item.createdAt, '创建时间')
  const updatedAt = timestampValue(item.updatedAt, '更新时间')
  if (updatedAt < createdAt) throw new Error('更新时间不能早于创建时间')
  const lastUsedAt =
    item.lastUsedAt == null ? undefined : timestampValue(item.lastUsedAt, '最近使用时间')

  return {
    id: stringValue(item.id, '条目 id', true)!,
    categoryId: stringValue(item.categoryId, '分类 id'),
    title: stringValue(item.title, '标题', true)!.trim(),
    url: stringValue(item.url, '网址'),
    username: stringValue(item.username, '账号'),
    password: stringValue(item.password, '密码'),
    notes: stringValue(item.notes, '备注'),
    favorite: booleanValue(item.favorite, '收藏状态'),
    totp: item.totp.map(normalizeTotp),
    linkedEmails: item.linkedEmails.map(normalizeLinkedEmail),
    customFields: item.customFields.map(normalizeCustomField),
    createdAt,
    updatedAt,
    lastUsedAt,
  }
}

export function normalizeVaultPayload(value: unknown): VaultPayload {
  const payload = record(value, '保险箱内容')
  if (payload.schemaVersion !== PAYLOAD_SCHEMA_VERSION) {
    throw new Error(`不支持的 payload 版本：${String(payload.schemaVersion)}`)
  }
  if (!Array.isArray(payload.categories) || !Array.isArray(payload.entries)) {
    throw new Error('保险箱缺少 categories 或 entries 数组')
  }
  const categories = payload.categories.map(normalizeCategory)
  const entries = payload.entries.map(normalizeEntry)

  const categoryIds = new Set(categories.map((item) => item.id))
  if (categoryIds.size !== categories.length) throw new Error('分类 id 重复')
  const entryIds = new Set(entries.map((item) => item.id))
  if (entryIds.size !== entries.length) throw new Error('条目 id 重复')

  for (const entry of entries) {
    if (entry.categoryId && !categoryIds.has(entry.categoryId)) {
      throw new Error(`条目 ${entry.id} 引用了不存在的分类`)
    }
    for (const link of entry.linkedEmails) {
      if (link.kind === 'entry' && (!entryIds.has(link.entryId) || link.entryId === entry.id)) {
        throw new Error(`条目 ${entry.id} 包含无效邮箱关联`)
      }
    }
    const totpIds = new Set(entry.totp.map((item) => item.id))
    if (totpIds.size !== entry.totp.length) throw new Error(`条目 ${entry.id} 的 TOTP id 重复`)
    const customFieldIds = new Set(entry.customFields.map((item) => item.id))
    if (customFieldIds.size !== entry.customFields.length) {
      throw new Error(`条目 ${entry.id} 的自定义字段 id 重复`)
    }
  }

  return { schemaVersion: PAYLOAD_SCHEMA_VERSION, categories, entries }
}
