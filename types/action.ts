/**
 * Extensible action registry for hover menu items.
 * Each action defines its own icon, label, and execution handler.
 * Actions can be toggled on/off and will be rendered in order of `order` field.
 */

/** Icon names from extension.md §2.1; HoverMenu maps them to inline SVG icons. */
export type HoverMenuIcon = 'brain' | 'highlighter' | 'bookmark' | 'scan' | 'film'

export interface HoverMenuAction {
  /** Unique action identifier */
  id: string
  /** Localized short label shown next to the icon */
  label: string
  icon: HoverMenuIcon
  /** Localized consequence hint: what the action does and how long it takes (shown after ~300ms hover/focus) */
  hint: string
  /** Sort order in the menu (lower = more left) */
  order: number
  /** Whether this action is currently enabled/visible */
  enabled: boolean
  /**
   * Action handler.
   * - 'expandable': reveals inline UI on click (e.g. "Add Note"); the menu flashes ✅ after submit.
   * - 'toggle':     enters a different mode (e.g. Highlighter); parent owns dismissal.
   * - 'dialog':     opens a dialog, toast or capture session; parent owns dismissal.
   */
  type: 'expandable' | 'toggle' | 'dialog'
}
