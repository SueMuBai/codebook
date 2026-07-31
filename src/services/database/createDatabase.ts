import { Capacitor } from '@capacitor/core'
import type { DatabaseAdapter } from './DatabaseAdapter'
import { IndexedDbAdapter } from './IndexedDbAdapter'

let singleton: DatabaseAdapter | null = null
let initPromise: Promise<DatabaseAdapter> | null = null

async function createAdapter(): Promise<DatabaseAdapter> {
  if (Capacitor.isNativePlatform()) {
    const { CapacitorSqliteAdapter } = await import('./CapacitorSqliteAdapter')
    const adapter = new CapacitorSqliteAdapter()
    await adapter.initialize()
    return adapter
  }

  const adapter = new IndexedDbAdapter()
  await adapter.initialize()
  return adapter
}

/**
 * Process-wide database singleton.
 * Browser → IndexedDB; native (Android/iOS) → SQLite.
 */
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (singleton) return singleton
  if (!initPromise) {
    initPromise = createAdapter()
      .then((db) => {
        singleton = db
        return db
      })
      .catch((error) => {
        initPromise = null
        throw error
      })
  }
  return initPromise
}

/** Test helper — reset singleton between cases. */
export async function resetDatabaseForTests(): Promise<void> {
  if (singleton) {
    await singleton.close()
  }
  singleton = null
  initPromise = null
}
