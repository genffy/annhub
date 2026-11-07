/**
 * Who may talk to the offscreen document (RV-BG-11, notes/sender-rules.md):
 * only the extension's own background. A content script carries a
 * `sender.tab`, a foreign extension carries another id — either one could
 * stop a recording or start a download the user never asked for.
 */
export function fromOwnBackground(sender: chrome.runtime.MessageSender): boolean {
  return !sender.tab && sender.id === chrome.runtime.id
}
