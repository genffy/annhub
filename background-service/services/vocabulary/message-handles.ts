import MessageUtils from '../../../utils/message'
import { VocabularyService } from '.'
import { ResponseMessage } from '../../../types/messages'

function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
    const url = sender.url ?? ''
    if (url.startsWith(chrome.runtime.getURL(''))) {
        return true
    }
    // Fallback for some extension contexts where sender.url may be empty.
    return !sender.tab && sender.id === chrome.runtime.id
}

function forbiddenResponse(): ResponseMessage {
    return MessageUtils.createResponse(false, undefined, 'Forbidden: extension page context required')
}

export const messageHandlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> = {
    GET_VOCAB_CONFIG: async (): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const config = await service.getVocabConfigPublic()
            return MessageUtils.createResponse(true, config)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SET_VOCAB_CONFIG: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.setVocabConfig(message.config)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_LLM_CONFIG: async (_message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const publicConfig = await service.getLlmConfigPublic()
            return MessageUtils.createResponse(true, publicConfig)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SET_LLM_CONFIG: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.setLlmConfig(message.config)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_VOCAB_SNAPSHOT: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const snapshot = await service.getSnapshot(message.words)
            return MessageUtils.createResponse(true, snapshot)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    REFRESH_VOCAB: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const result = await service.syncFromEudic({ force: message.force })
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_EUDIC_CATEGORIES: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const categories = await service.listEudicCategories(message.language ?? 'en')
            return MessageUtils.createResponse(true, categories)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    CREATE_EUDIC_CATEGORY: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const category = await service.createEudicCategory(message.name, message.language ?? 'en')
            return MessageUtils.createResponse(true, category)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    RENAME_EUDIC_CATEGORY: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.renameEudicCategory(message.id, message.name, message.language ?? 'en')
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    DELETE_EUDIC_CATEGORY: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.deleteEudicCategory(message.id, message.name, message.language ?? 'en')
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_EUDIC_WORDS: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const result = await service.listEudicWords(message.categoryId, {
                language: message.language ?? 'en',
                page: message.page,
                pageSize: message.pageSize,
            })
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    ADD_EUDIC_WORD: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.addEudicWord(message.word, {
                language: message.language ?? 'en',
                star: message.star,
                contextLine: message.contextLine,
                categoryIds: message.categoryIds,
            })
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    DELETE_EUDIC_WORDS: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.deleteEudicWords(message.categoryId, message.words, message.language ?? 'en')
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_EUDIC_WORD: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const result = await service.getEudicWord(message.word, message.language ?? 'en')
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    CONTEXT_GLOSS: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.resolveGloss(message.word, message.sentence, message.targetLanguage)
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },
}
