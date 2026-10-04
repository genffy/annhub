/**
 * Sender checks shared by every service. Content scripts run inside web pages,
 * so a message from one is only as trustworthy as the page; messages that read
 * or change user data and configuration must come from an extension page.
 */
import MessageUtils from '../utils/message'
import type { ResponseMessage } from '../types/messages'

export function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? ''
  if (url.startsWith(chrome.runtime.getURL(''))) return true
  // Some extension contexts report an empty sender.url; a tab-less sender with our id is still ours.
  return !sender.tab && sender.id === chrome.runtime.id
}

export function forbiddenResponse(): ResponseMessage {
  return MessageUtils.createResponse(false, undefined, 'Forbidden: extension page context required')
}
