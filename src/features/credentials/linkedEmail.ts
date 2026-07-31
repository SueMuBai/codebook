import type { CredentialEntry, LinkedEmailRef, VaultPayload } from '@/types/domain'

export function findReferencingEntries(payload: VaultPayload, entryId: string): CredentialEntry[] {
  return payload.entries.filter((entry) =>
    entry.linkedEmails.some((ref) => ref.kind === 'entry' && ref.entryId === entryId),
  )
}

export function removeEntryAndConvertReferences(payload: VaultPayload, entryId: string): VaultPayload {
  const target = payload.entries.find((entry) => entry.id === entryId)
  if (!target) return payload

  const entries = payload.entries
    .filter((entry) => entry.id !== entryId)
    .map((entry) => ({
      ...entry,
      linkedEmails: entry.linkedEmails.map((ref): LinkedEmailRef => {
        if (ref.kind !== 'entry' || ref.entryId !== entryId) return ref
        return {
          kind: 'text',
          email: ref.emailSnapshot || ref.labelSnapshot,
          note: '原关联记录已删除',
        }
      }),
    }))

  return { ...payload, entries }
}
