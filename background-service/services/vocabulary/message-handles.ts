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

    FETCH_LLM_MODELS: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const models = await service.fetchLlmModels(message.config)
            return MessageUtils.createResponse(true, models)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    TEST_LLM_CONNECTION: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            const result = await service.testLlmConnection(message.config)
            return MessageUtils.createResponse(true, result)
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

    ENSURE_VOCAB_LEARNING_CATEGORY: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.ensureLearningCategory({
                language: message.language ?? 'en',
                name: message.name,
            })
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SELECT_VOCAB_LEARNING_CATEGORY: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.selectLearningCategory(message.categoryId)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    ENSURE_VOCAB_MASTERED_CATEGORY: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.ensureMasteredCategory({
                language: message.language ?? 'en',
                name: message.name,
            })
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SELECT_VOCAB_MASTERED_CATEGORY: async (message: any, sender: chrome.runtime.MessageSender): Promise<ResponseMessage> => {
        if (!isExtensionPageSender(sender)) return forbiddenResponse()
        try {
            const service = VocabularyService.getInstance()
            await service.selectMasteredCategory(message.categoryId)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SYNC_VOCAB_LEARNING_PROFILE: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const syncResult = await service.syncLearningProfileFromEudic({
                force: message.force,
                language: message.language ?? 'en',
            })
            const flushResult = await service.flushLearningPendingEvents()
            return MessageUtils.createResponse(true, {
                ...syncResult,
                flush: flushResult,
            })
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    RECORD_VOCAB_LEARNING_EVENT: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.recordLearningEvent(message.event)
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    FLUSH_VOCAB_LEARNING_PENDING: async (): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.flushLearningPendingEvents()
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_VOCAB_LEARNING_SYNC_STATE: async (): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const state = await service.getLearningSyncState()
            return MessageUtils.createResponse(true, state)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_VOCAB_LEARNING_PROFILE: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const profile = await service.getLearningProfile(message.words)
            return MessageUtils.createResponse(true, profile)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    RESET_VOCAB_WORD_LEARNING: async (message: any): Promise<ResponseMessage> => {
        try {
            const service = VocabularyService.getInstance()
            const result = await service.resetWordLearning(message.word, message.language ?? 'en')
            return MessageUtils.createResponse(true, result)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },
}
