import MessageUtils from "../../../utils/message"
import { GetHighlightsMessage, ResponseMessage, SaveHighlightMessage, DeleteHighlightMessage, GetCurrentPageHighlightsMessage, LocateHighlightMessage, HighlightStatsResponse, RequiredFields } from "../../../types/messages"
import { HighlightStorage } from "./highlight-storage"
import { HighlightRecord } from "../../../types/highlight"

export const messageHandlers = {

    GET_HIGHLIGHTS: async (message: GetHighlightsMessage): Promise<ResponseMessage> => {
        try {
            const highlights = await HighlightStorage.getInstance().getHighlights(message.query)
            return MessageUtils.createResponse(true, highlights)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SAVE_HIGHLIGHT: async (message: SaveHighlightMessage): Promise<ResponseMessage> => {
        try {


            const saveResult = await HighlightStorage.getInstance().saveHighlight(message.data)
            if (!saveResult.success) {
                return MessageUtils.createResponse(false, undefined, saveResult.error)
            }
            return MessageUtils.createResponse(true, saveResult.data)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },
    UPDATE_HIGHLIGHT: async (message: RequiredFields<HighlightRecord, 'id'>): Promise<ResponseMessage> => {
        try {
            await HighlightStorage.getInstance().updateHighlight(message.id, message)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    DELETE_HIGHLIGHT: async (message: DeleteHighlightMessage): Promise<ResponseMessage> => {
        try {
            await HighlightStorage.getInstance().deleteHighlight(message.data.id)
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_CURRENT_PAGE_HIGHLIGHTS: async (message: GetCurrentPageHighlightsMessage): Promise<ResponseMessage> => {
        try {
            const highlights = await HighlightStorage.getInstance().getCurrentPageHighlights(message.url)
            return MessageUtils.createResponse(true, highlights)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    CLEAR_ALL_HIGHLIGHTS: async (): Promise<ResponseMessage> => {
        try {
            await HighlightStorage.getInstance().clearAllHighlights()
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    GET_HIGHLIGHT_STATS: async (): Promise<ResponseMessage<HighlightStatsResponse>> => {
        try {
            const stats = await HighlightStorage.getInstance().getStats()
            const response: HighlightStatsResponse = {
                total: stats.total,
                active: stats.active,
                archived: stats.archived,
                deleted: stats.deleted
            }
            return MessageUtils.createResponse(true, response)
        } catch (error) {
            return MessageUtils.createResponse<HighlightStatsResponse>(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    // GET_STATUS: async (): Promise<ResponseMessage<SystemStatus>> => {
    //     try {
    //         const status: SystemStatus = {
    //             isInitialized: Object.values(servicesInitialized).every(Boolean),
    //             services: servicesInitialized,
    //             version: browser.runtime.getManifest().version
    //         }
    //         return MessageUtils.createResponse(true, status)
    //     } catch (error) {
    //         return MessageUtils.createResponse<SystemStatus>(false, undefined, error instanceof Error ? error.message : 'Unknown error')
    //     }
    // },

    LOCATE_HIGHLIGHT: async (message: LocateHighlightMessage): Promise<ResponseMessage> => {
        try {

            const [tab] = await browser.tabs.query({ active: true, currentWindow: true })

            if (!tab?.id) {
                return MessageUtils.createResponse(false, undefined, 'No active tab found')
            }


            const highlights = await HighlightStorage.getInstance().getHighlights({
                limit: 1000
            })

            const highlight = highlights.find(h => h.id === message.data.id)
            if (!highlight) {
                return MessageUtils.createResponse(false, undefined, 'Highlight not found')
            }


            if (tab.url !== highlight.url) {
                await browser.tabs.update(tab.id, { url: highlight.url })


                await new Promise<void>((resolve) => {
                    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            browser.tabs.onUpdated.removeListener(listener)
                            resolve()
                        }
                    }
                    browser.tabs.onUpdated.addListener(listener)
                })
            }


            await browser.tabs.sendMessage(tab.id, {
                type: 'LOCATE_HIGHLIGHT',
                data: { id: message.data.id }
            })

            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    }
}