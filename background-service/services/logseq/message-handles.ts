import MessageUtils from '../../../utils/message'
import { ResponseMessage, LogseqSyncHighlightMessage, LogseqSyncClipMessage, LogseqSetConfigMessage } from '../../../types/messages'
import { LogseqSyncService } from './logseq-sync'

const syncService = () => LogseqSyncService.getInstance()

export const logseqMessageHandlers: Record<
    string,
    (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>
> = {
    LOGSEQ_TEST_CONNECTION: async (): Promise<ResponseMessage> => {
        try {
            const ok = await syncService().testConnection()
            return MessageUtils.createResponse(true, ok)
        } catch (error) {
            return MessageUtils.createResponse(false, false, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    LOGSEQ_GET_CONFIG: async (): Promise<ResponseMessage> => {
        try {
            const config = await syncService().getConfig()
            return MessageUtils.createResponse(true, config)
        } catch (error) {
            return MessageUtils.createResponse(false, null, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    LOGSEQ_SET_CONFIG: async (message: LogseqSetConfigMessage): Promise<ResponseMessage> => {
        try {
            const config = await syncService().setConfig(message.config)
            return MessageUtils.createResponse(true, config)
        } catch (error) {
            return MessageUtils.createResponse(false, null, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    LOGSEQ_SYNC_HIGHLIGHT: async (message: LogseqSyncHighlightMessage): Promise<ResponseMessage> => {
        try {
            const result = await syncService().syncHighlight(message.data)
            return MessageUtils.createResponse(result.success, result, result.error)
        } catch (error) {
            return MessageUtils.createResponse(false, null, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    LOGSEQ_SYNC_CLIP: async (message: LogseqSyncClipMessage): Promise<ResponseMessage> => {
        try {
            const result = await syncService().syncClip(message.data)
            return MessageUtils.createResponse(result.success, result, result.error)
        } catch (error) {
            return MessageUtils.createResponse(false, null, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    LOGSEQ_SYNC_ALL: async (): Promise<ResponseMessage> => {
        try {
            const result = await syncService().syncAll()
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, null, error instanceof Error ? error.message : 'Unknown error')
        }
    },
}
