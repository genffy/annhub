/**
 * Entry service — the message facade over the domain store (docs/v2/entry.md,
 * storage.md, search.md). Every write validates in the domain layer and
 * commits dependents in one transaction; senders are checked per message.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isRecentCapture, isSameOriginTabSender, rememberCapture } from '../../sender'
import { initializedEntryStore } from '../../store-instance'
import { cleanSourceUrl } from '../../../learning-core/url'
import { presetProperties } from '../../../learning-core/properties'
import { queryEntries } from '../../../learning-core/query'
import { storageErrorCode } from '../errors'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { recordCaptureSaved, recordCaptureFailed } from '../metrics/record'

/** A sender allowed to read or change user data: an extension page, or a page's own content script. */
function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  return isExtensionPageSender(sender) || isSameOriginTabSender(sender)
}

export class EntryService implements IService {
  readonly name = 'entries' as const
  private static instance: EntryService | null = null
  private initialized = false

  static getInstance(): EntryService {
    EntryService.instance ??= new EntryService()
    return EntryService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await initializedEntryStore()
    this.initialized = true
    Logger.info('[EntryService] Initialized (annhub IndexedDB v1)')
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return {
      SAVE_CLIP: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const draft = message.draft
          const { via, blockKind, levelChanged, truncated, durationMs, startedAt, ...fields } = draft
          const registry = await store.listPropertyDefinitions()
          const properties = { ...presetProperties('clip', registry, fields.properties), ...fields.properties }
          const started = performance.now()
          const entry = await store.saveEntry({
            id: fields.id,
            type: 'clip',
            content: fields.content,
            context: fields.context,
            note: fields.note,
            sourceUrl: cleanSourceUrl(fields.sourceUrl),
            properties,
            newDefinitions: fields.newDefinitions,
          })
          await recordCaptureSaved({
            type: 'clip',
            via,
            blockKind,
            levelChanged,
            truncated,
            durationMs: typeof startedAt === 'number' && startedAt > 0 ? Math.max(0, Date.now() - startedAt) : (durationMs ?? performance.now() - started),
          })
          await rememberCapture(sender, entry.id)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          void recordCaptureFailed(error, 'clip')
          return failure(error)
        }
      },

      DELETE_ENTRY: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        if (!isExtensionPageSender(sender) && !(await isRecentCapture(sender, message.id))) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          await store.deleteEntry(message.id)
          if (message.attribution) await recordCaptureUndone(message.attribution)
          return MessageUtils.createResponse(true, { id: message.id })
        } catch (error) {
          return failure(error)
        }
      },

      UPDATE_ENTRY: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        if (!isExtensionPageSender(sender)) {
          if (!(await isRecentCapture(sender, message.id)) || !quickEditPatch(message.patch)) return forbiddenResponse()
        }
        try {
          const store = await initializedEntryStore()
          const entry = await store.updateEntry(message.id, message.patch)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      ADD_HIGHLIGHT: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entry = await store.addHighlight(message.id, message.highlight)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      UPDATE_HIGHLIGHT: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entry = await store.updateHighlight(message.id, message.highlightId, message.patch)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      REMOVE_HIGHLIGHT: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entry = await store.removeHighlight(message.id, message.highlightId)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      RESTORE_HIGHLIGHT: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entry = await store.restoreHighlight(message.id, message.highlight)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      QUERY_ENTRIES: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const registry = await store.listPropertyDefinitions()
        const query = message.query ?? {}
        const indexed =
          !query.search?.trim() &&
          !query.types?.length &&
          !query.hosts?.length &&
          !query.tags?.length &&
          !query.conditions?.length &&
          query.createdFrom === undefined &&
          query.createdTo === undefined
        const result = indexed
          ? await (async () => {
              const candidates = await store.recentCandidates(Math.max(1, query.limit ?? 50), query.cursor)
              const page = queryEntries(candidates.items, registry, { limit: query.limit })
              return { ...page, total: candidates.total }
            })()
          : await store.indexedQuery(query)
        return MessageUtils.createResponse(true, {
          result: { ...result, items: result.items.map(entry => ({ ...entry, content: entry.type === 'clip' ? entry.content.slice(0, 500) : '' })) },
        })
      },

      QUERY_HIGHLIGHTS: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const result = await store.indexedHighlights(message.query ?? {})
        return MessageUtils.createResponse(true, {
          result: { ...result, groups: result.groups.map(group => ({ ...group, clip: { ...group.clip, content: '' } })) },
        })
      },

      QUERY_FACETS: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, { facets: await store.libraryFacets() })
      },

      GET_ENTRY: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const entry = await store.getEntry(message.id)
        return MessageUtils.createResponse(true, { entry })
      },

      GET_ASSET_DATA_URL: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const asset = await store.getAsset(message.assetId)
        if (!asset) return MessageUtils.createResponse(false, undefined, 'asset not found')
        return MessageUtils.createResponse(true, { dataUrl: await blobToDataUrl(asset.bytes) })
      },

      LIST_PROPERTIES: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const definitions = await store.listPropertyDefinitions()
        const usage = message.includeUsage ? await store.propertyUsageCounts(definitions.map(def => def.name)) : undefined
        return MessageUtils.createResponse(true, { definitions, usage })
      },

      UPSERT_PROPERTY: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        await store.upsertPropertyDefinition(message.def)
        return MessageUtils.createResponse(true, { definitions: await store.listPropertyDefinitions() })
      },

      DELETE_PROPERTY: async (message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        await store.deletePropertyDefinition(message.name)
        return MessageUtils.createResponse(true, { definitions: await store.listPropertyDefinitions() })
      },

      DELETE_UNUSED_PROPERTIES: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const removed = await store.deleteUnusedPropertyDefinitions()
        return MessageUtils.createResponse(true, { removed, definitions: await store.listPropertyDefinitions() })
      },

      USAGE_ESTIMATE: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, await store.usageEstimate())
      },

      ORPHAN_REPORT: async (_message, sender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, await store.orphanReport())
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

function quickEditPatch(patch: unknown): boolean {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false
  const value = patch as Record<string, unknown>
  if (Object.keys(value).some(key => key !== 'properties' && key !== 'note')) return false
  if ('note' in value && typeof value.note !== 'string' && value.note !== null) return false
  if (!('properties' in value)) return true
  const properties = value.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return false
  const record = properties as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'set')) return false
  const set = record.set
  if (!set || typeof set !== 'object' || Array.isArray(set)) return false
  return Object.entries(set).every(
    ([name, item]) => (name === 'title' && typeof item === 'string') || (name === 'tags' && Array.isArray(item) && item.every(tag => typeof tag === 'string')),
  )
}

async function recordCaptureUndone(attribution: { via: string; type?: string; blockKind?: string; levelChanged?: boolean }): Promise<void> {
  const { recordEvent } = await import('../metrics/record')
  await recordEvent('capture.undone', {
    type: (attribution.type ?? 'clip') as 'clip' | 'screenshot',
    via: attribution.via as 'menu' | 'block' | 'shortcut',
  })
}

function failure(error: unknown): ResponseMessage {
  const code = storageErrorCode(error)
  Logger.error('[EntryService]', code)
  return MessageUtils.createResponse(false, undefined, code)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}
