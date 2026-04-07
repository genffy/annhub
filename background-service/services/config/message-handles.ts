import { ResponseMessage } from "../../../types/messages"

export const messageHandlers: Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> = {
}
