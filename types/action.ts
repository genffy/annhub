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
     * - For simple actions, return void.
     * - For actions that expand inline UI (like "Add Note"), the component
     *   manages its own expanded state internally.
     */
    type: 'instant' | 'expandable' | 'toggle'
}
