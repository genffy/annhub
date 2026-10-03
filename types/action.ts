/**
 * Extensible action registry for hover menu items.
 * Each action defines its own icon, label, and execution handler.
 * Actions can be toggled on/off and will be rendered in order of `order` field.
 */

export interface HoverMenuAction {
  /** Unique action identifier */
  id: string
  /** Display label */
  label: string
  /** Emoji or icon string to render */
  icon: string
  /** Tooltip description */
  desc: string
  /** Sort order in the menu (lower = more left) */
  order: number
  /** Whether this action is currently enabled/visible */
  enabled: boolean
  /**
   * Action handler.
   * - 'instant':    fire-and-forget; shows ✅ flash then dismisses.
   * - 'expandable': reveals inline UI on click (e.g. "Add Note").
   * - 'toggle':     enters a different mode (e.g. Highlighter); parent owns dismissal.
   * - 'dialog':     opens a dialog (e.g. capture modal); parent owns dismissal.
   */
  type: 'instant' | 'expandable' | 'toggle' | 'dialog'
}
