/** Provider settings: extension pages only, and the stored key is never returned. */
import MessageUtils from '../../../utils/message'
import { forbiddenResponse, isExtensionPageSender } from '../../sender'
import type { ResponseMessage } from '../../../types/messages'
import { LlmService } from './service'

type Handler = (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>

const fail = (error: unknown): ResponseMessage => MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')

function pageOnly(run: (message: any) => Promise<unknown>): Handler {
  return async (message, sender) => {
    if (!isExtensionPageSender(sender)) return forbiddenResponse()
    try {
      return MessageUtils.createResponse(true, await run(message))
    } catch (error) {
      return fail(error)
    }
  }
}

export const messageHandlers: Record<string, Handler> = {
  GET_LLM_CONFIG: pageOnly(() => LlmService.getInstance().getLlmConfigPublic()),
  SET_LLM_CONFIG: pageOnly(async message => {
    await LlmService.getInstance().setLlmConfig(message.config)
  }),
  TEST_LLM_CONNECTION: pageOnly(message => LlmService.getInstance().testLlmConnection(message.config)),
}
