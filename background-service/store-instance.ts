/**
 * The single EntryStore connection for the service worker; services share
 * it so transactions serialize through one IndexedDB database handle.
 */
import { EntryStore } from '../learning-core/store'

let instance: EntryStore | null = null

export function sharedEntryStore(): EntryStore {
  instance ??= new EntryStore('annhub')
  return instance
}

export async function initializedEntryStore(): Promise<EntryStore> {
  const store = sharedEntryStore()
  await store.initialize()
  return store
}
