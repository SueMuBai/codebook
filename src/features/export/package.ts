import { BACKUP_PACKAGE_VERSION } from '@/features/crypto/constants'
import { assertVaultRecord } from '@/features/crypto/vaultCodec'
import { validateEntryDraft } from '@/features/credentials/validators'
import type {
  Category,
  CredentialEntry,
  PortableSettings,
  VaultRecord,
} from '@/types/domain'

export interface EncryptedExportPackageV2 {
  format: 'codebook-encrypted'
  packageVersion: 2
  exportedAt: number
  vault: VaultRecord
  settings?: PortableSettings
}

export interface CsvEntryDraft {
  title: string
  url?: string
  username?: string
  password?: string
  notes?: string
  favorite: boolean
  categoryName?: string
}

export interface CsvParseResult {
  entries: CsvEntryDraft[]
  skipped: number
  failed: number
}

export function buildEncryptedPackage(input: {
  vault: VaultRecord
  settings?: PortableSettings
  exportedAt?: number
}): EncryptedExportPackageV2 {
  assertVaultRecord(input.vault)
  return {
    format: 'codebook-encrypted',
    packageVersion: BACKUP_PACKAGE_VERSION,
    exportedAt: input.exportedAt ?? Date.now(),
    vault: input.vault,
    settings: input.settings,
  }
}

export function parseEncryptedPackage(raw: string): EncryptedExportPackageV2 {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error('备份不是有效 JSON')
  }
  if (!value || typeof value !== 'object') throw new Error('备份结构无效')
  const data = value as Partial<EncryptedExportPackageV2>
  if (data.format !== 'codebook-encrypted') throw new Error('不是密语加密备份')
  if (data.packageVersion !== BACKUP_PACKAGE_VERSION) {
    throw new Error(`不支持的备份版本：${String(data.packageVersion)}`)
  }
  assertVaultRecord(data.vault)
  if (
    typeof data.exportedAt !== 'number' ||
    !Number.isSafeInteger(data.exportedAt) ||
    data.exportedAt < 0
  ) {
    throw new Error('备份导出时间无效')
  }
  if ('settings' in data && data.settings !== undefined) assertPortableSettings(data.settings)
  return data as EncryptedExportPackageV2
}

function assertPortableSettings(value: unknown): asserts value is PortableSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份设置无效')
  const settings = value as Partial<PortableSettings>
  if (![0, 30, 60, 90, 180, 300].includes(settings.autoLockSeconds ?? -1)) {
    throw new Error('备份自动锁定设置无效')
  }
  if (![0, 15, 30, 60].includes(settings.clipboardClearSeconds ?? -1)) {
    throw new Error('备份剪贴板设置无效')
  }
  if (settings.theme !== 'auto' && settings.theme !== 'light' && settings.theme !== 'dark') {
    throw new Error('备份主题设置无效')
  }
  if (![0, 10, 30, 60].includes(settings.totpRevealSeconds ?? -1)) {
    throw new Error('备份 TOTP 显示设置无效')
  }
}

export function entriesToCsv(entries: CredentialEntry[], categories: Category[]): string {
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]))
  const rows = [['title', 'url', 'username', 'password', 'notes', 'favorite', 'category']]
  for (const entry of entries) {
    rows.push([
      entry.title,
      entry.url ?? '',
      entry.username ?? '',
      entry.password ?? '',
      entry.notes ?? '',
      entry.favorite ? '1' : '0',
      entry.categoryId ? categoryNames.get(entry.categoryId) ?? '' : '',
    ])
  }
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`
}

export function parseCsvEntries(csv: string): CsvParseResult {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ''))
  if (!rows.length) return { entries: [], skipped: 0, failed: 0 }
  const headers = rows[0]!.map((value) => value.trim().toLowerCase())
  const index = (name: string) => headers.indexOf(name)
  const entries: CsvEntryDraft[] = []
  let skipped = 0
  let failed = 0

  for (const row of rows.slice(1)) {
    if (row.every((value) => !value.trim())) continue
    const get = (name: string) => {
      const position = index(name)
      return position >= 0 ? row[position]?.trim() ?? '' : ''
    }
    const title = get('title') || get('name')
    if (!title) {
      skipped += 1
      continue
    }
    const draft: CsvEntryDraft = {
      title,
      url: get('url') || undefined,
      username: get('username') || get('user') || undefined,
      password: get('password') || undefined,
      notes: get('notes') || get('note') || undefined,
      favorite: ['1', 'true', 'yes'].includes(get('favorite').toLowerCase()),
      categoryName: get('category') || undefined,
    }
    if (validateEntryDraft(draft) || (draft.categoryName?.length ?? 0) > 40) {
      failed += 1
      continue
    }
    entries.push(draft)
  }

  return { entries, skipped, failed }
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  row.push(field.replace(/\r$/, ''))
  if (row.length > 1 || row[0]) rows.push(row)
  return rows
}
