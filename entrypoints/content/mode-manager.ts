/**
 * ModeManager — global state for isHighlighterMode.
 * Not React-dependent. Used by both React components and native event listeners.
 */

type ModeChangeCallback = (isHighlighterMode: boolean) => void

class ModeManager {
    private static instance: ModeManager | null = null
    private _isHighlighterMode = false
    private listeners: Set<ModeChangeCallback> = new Set()

    private constructor() { }

    static getInstance(): ModeManager {
        if (!ModeManager.instance) {
            ModeManager.instance = new ModeManager()
        }
        return ModeManager.instance
    }

    getMode(): boolean {
        return this._isHighlighterMode
    }

    setMode(value: boolean): void {
        if (this._isHighlighterMode === value) return
        this._isHighlighterMode = value
        this.notifyListeners()
    }

    toggle(): void {
        this.setMode(!this._isHighlighterMode)
    }

    /**
     * Subscribe to mode changes.
     * @returns unsubscribe function
     */
    onModeChange(callback: ModeChangeCallback): () => void {
        this.listeners.add(callback)
        return () => {
            this.listeners.delete(callback)
        }
    }

    private notifyListeners(): void {
        const mode = this._isHighlighterMode
        this.listeners.forEach(cb => {
            try {
                cb(mode)
            } catch (e) {
                console.error('[ModeManager] Listener error:', e)
            }
        })
    }
}

export default ModeManager.getInstance()
