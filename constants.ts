export const ANN_SELECTION_KEY = 'capture-selection'

/**
 * Name of the global the content script registers in its isolated world so the background's last-resort
 * trigger (`scripting.executeScript` in that same world) can start a screenshot. It is not a DOM event:
 * any script in the page can dispatch one of those, and could then open the capture session on its own.
 */
export const SCREENSHOT_TRIGGER_GLOBAL = '__annhubEnterScreenshot'
