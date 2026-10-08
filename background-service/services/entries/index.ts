/**
 * Entry service — the message facade over the domain store (docs/v2/entry.md,
 * storage.md, search.md). Every write validates in the domain layer and
 * commits dependents in one transaction; senders are checked per message.
 */
import type { IService } from '../../service-manager'
import type { ResponseMessage } from '../../../types/messages'
import { forbiddenResponse, isExtensionPageSender, isTopFrameTabSender } from '../../sender'
import { initializedEntryStore } from '../../store-instance'
import { cleanSourceUrl } from '../../../learning-core/url'
import { presetProperties } from '../../../learning-core/properties'
import { queryEntries, queryHighlights } from '../../../learning-core/query'
import { mergeHighlight } from '../../../learning-core/validate'
import { buildExport, type ExportLanguage } from '../../../learning-core/export'
import { EntryValidationError } from '../../../learning-core/types'
import { Logger } from '../../../utils/logger'
import MessageUtils from '../../../utils/message'
import { recordCaptureSaved, recordCaptureFailed } from '../metrics/record'

/** A sender allowed to read or change user data: an extension page, or a page's own content script. */
function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  return isExtensionPageSender(sender) || isTopFrameTabSender(sender)
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
          const { via, blockKind, levelChanged, truncated, durationMs, ...fields } = draft
          const registry = await store.listPropertyDefinitions()
          const properties = { ...presetProperties('clip', registry, fields.properties), ...fields.properties }
          const started = performance.now()
          const entry = await store.saveEntry({
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
            durationMs: durationMs ?? performance.now() - started,
          })
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          void recordCaptureFailed(error, 'clip')
          return failure(error)
        }
      },

      DELETE_ENTRY: async (message): Promise<ResponseMessage> => {
        if (!trustedSender) return forbiddenResponse()
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
        try {
          const store = await initializedEntryStore()
          const entry = await store.updateEntry(message.id, message.patch)
          return MessageUtils.createResponse(true, { entry })
        } catch (error) {
          return failure(error)
        }
      },

      ADD_HIGHLIGHT: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entry = await store.getEntry(message.id)
          if (!entry) throw new EntryValidationError('ENTRY_CONTENT_INVALID', `no entry ${message.id}`)
          const highlights = mergeHighlight(entry.highlights ?? [], message.highlight)
          const updated = await store.updateEntry(message.id, { highlights })
          return MessageUtils.createResponse(true, { entry: updated })
        } catch (error) {
          return failure(error)
        }
      },

      QUERY_ENTRIES: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const registry = await store.listPropertyDefinitions()
        const result = queryEntries(await store.listEntries(), registry, message.query)
        return MessageUtils.createResponse(true, { result })
      },

      QUERY_HIGHLIGHTS: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const registry = await store.listPropertyDefinitions()
        const result = queryHighlights(await store.listEntries(), registry, message.query)
        return MessageUtils.createResponse(true, { result })
      },

      GET_ENTRY: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const entry = await store.getEntry(message.id)
        return MessageUtils.createResponse(true, { entry })
      },

      GET_ASSET_DATA_URL: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const asset = await store.getAsset(message.assetId)
        if (!asset) return MessageUtils.createResponse(false, undefined, 'asset not found')
        return MessageUtils.createResponse(true, { dataUrl: await blobToDataUrl(asset.bytes) })
      },

      LIST_PROPERTIES: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, { definitions: await store.listPropertyDefinitions() })
      },

      UPSERT_PROPERTY: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        await store.upsertPropertyDefinition(message.def)
        return MessageUtils.createResponse(true, { definitions: await store.listPropertyDefinitions() })
      },

      DELETE_PROPERTY: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        await store.deletePropertyDefinition(message.name)
        return MessageUtils.createResponse(true, { definitions: await store.listPropertyDefinitions() })
      },

      DELETE_UNUSED_PROPERTIES: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        const removed = await store.deleteUnusedPropertyDefinitions()
        return MessageUtils.createResponse(true, { removed, definitions: await store.listPropertyDefinitions() })
      },

      EXPORT_ZIP: async (message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        try {
          const store = await initializedEntryStore()
          const entries = await store.listEntries()
          const registry = await store.listPropertyDefinitions()
          const summary = await buildExport({
            exportedAt: Date.now(),
            lang: (message.lang ?? 'zh') as ExportLanguage,
            entries,
            registry,
            readAsset: async assetId => {
              const asset = await store.getAsset(assetId)
              if (!asset) return undefined
              return { metadata: asset.metadata, bytes: new Uint8Array(await asset.bytes.arrayBuffer()) }
            },
          })
          const blob = summary.blob
          // MV3 service workers have no URL.createObjectURL: the ZIP travels to
          // chrome.downloads as a data URL (build is still Blob-based, read per asset)
          const dataUrl = await blobToDataUrl(blob)
          const filename = `AnnHub-export-${new Date().toISOString().slice(0, 10)}.zip`
          const downloadId = await downloadUrl(dataUrl, filename)
          return MessageUtils.createResponse(true, {
            result: summary.result,
            clips: summary.clips,
            screenshots: summary.screenshots,
            missingAssets: summary.missingAssets,
            downloadId,
          })
        } catch (error) {
          return failure(error)
        }
      },

      USAGE_ESTIMATE: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, await store.usageEstimate())
      },

      ORPHAN_REPORT: async (_message, sender): Promise<ResponseMessage> => {
        if (!trustedSender(sender)) return forbiddenResponse()
        const store = await initializedEntryStore()
        return MessageUtils.createResponse(true, await store.orphanReport())
      },
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

async function recordCaptureUndone(attribution: { via: string; type?: string; blockKind?: string; levelChanged?: boolean }): Promise<void> {
  const { recordEvent } = await import('../metrics/record')
  await recordEvent('capture.undone', {
    type: (attribution.type ?? 'clip') as 'clip' | 'screenshot',
    via: attribution.via as 'menu' | 'block' | 'shortcut',
    ...(attribution.blockKind ? { block_kind: attribution.blockKind } : {}),
  })
}

function failure(error: unknown): ResponseMessage {
  const detail = error instanceof EntryValidationError ? error.code : error instanceof Error ? error.message : String(error)
  Logger.error('[EntryService]', detail)
  return MessageUtils.createResponse(false, undefined, detail)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function downloadUrl(url: string, filename: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, downloadId => {
      const error = chrome.runtime.lastError
      if (error || downloadId === undefined) {
        reject(new Error(error?.message || 'download failed'))
        return
      }
      resolve(downloadId)
    })
  })
}
