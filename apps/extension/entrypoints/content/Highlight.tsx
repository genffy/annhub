import { useState, useEffect, useRef } from 'react'
import { HighlightService } from './highlight/service'
import { HighlightRecord } from '../../types/highlight'

interface HighlightProps {
    selectedRange: Range | null
    onHighlightCreated?: (highlight: HighlightRecord) => void
    onClose?: () => void
}

const DEFAULT_COLORS = [
    { name: 'Yellow', value: '#ffeb3b', textColor: '#000000' },
    { name: 'Green', value: '#4caf50', textColor: '#ffffff' },
    { name: 'Blue', value: '#2196f3', textColor: '#ffffff' },
    { name: 'Pink', value: '#e91e63', textColor: '#ffffff' },
    { name: 'Orange', value: '#ff9800', textColor: '#000000' },
    { name: 'Purple', value: '#9c27b0', textColor: '#ffffff' }
]

export default function Highlight({ selectedRange, onHighlightCreated, onClose }: HighlightProps) {
    const [highlightService] = useState(() => HighlightService.getInstance())
    const [selectedColor, setSelectedColor] = useState(DEFAULT_COLORS[0].value)
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [highlights, setHighlights] = useState<HighlightRecord[]>([])
    const [stats, setStats] = useState({ total: 0, active: 0 })
    const mountedRef = useRef(true)

    useEffect(() => {
        const initializeService = async () => {
            try {
                await highlightService.initialize()
                await loadHighlights()
                await loadStats()
            } catch (error) {
                console.error('[Highlight] Failed to initialize service:', error)
                setError('Failed to initialize highlight service')
            }
        }

        initializeService()

        return () => {
            mountedRef.current = false
        }
    }, [])

    const loadHighlights = async () => {
        try {
            const pageHighlights = await highlightService.getCurrentPageHighlights()
            if (mountedRef.current) {
                setHighlights(pageHighlights)
            }
        } catch (error) {
            console.error('[Highlight] Failed to load highlights:', error)
        }
    }

    const loadStats = async () => {
        try {
            const highlightStats = await highlightService.getHighlightStats()
            if (mountedRef.current) {
                setStats({
                    total: highlightStats.storage.total,
                    active: highlightStats.storage.active
                })
            }
        } catch (error) {
            console.error('[Highlight] Failed to load stats:', error)
        }
    }

    const handleCreateHighlight = async () => {
        if (!selectedRange) {
            setError('No text selected')
            return
        }

        setIsCreating(true)
        setError(null)

        try {
            const result = await highlightService.createHighlight(selectedRange, selectedColor)

            if (result.success && result.data) {
                await loadHighlights()
                await loadStats()
                onHighlightCreated?.(result.data)
                onClose?.()
            } else {
                setError(result.error || 'Failed to create highlight')
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Unknown error')
        } finally {
            setIsCreating(false)
        }
    }

    const handleClearAll = async () => {
        try {
            await highlightService.clearAllHighlights()
            await loadHighlights()
            await loadStats()
        } catch (error) {
            console.error('[Highlight] Failed to clear highlights:', error)
            setError('Failed to clear highlights')
        }
    }

    const ColorPicker = () => (
        <div style={{
            display: 'flex',
            gap: '8px',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            marginBottom: '8px'
        }}>
            {DEFAULT_COLORS.map((color) => (
                <button
                    key={color.value}
                    onClick={() => {
                        setSelectedColor(color.value)
                        setShowColorPicker(false)
                    }}
                    style={{
                        width: '24px',
                        height: '24px',
                        backgroundColor: color.value,
                        border: selectedColor === color.value ? '2px solid #333' : '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'
                    }}
                    title={color.name}
                />
            ))}
        </div>
    )

    const HighlightItem = ({ highlight }: { highlight: HighlightRecord }) => (
        <div style={{
            padding: '8px',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
            marginBottom: '4px',
            fontSize: '12px'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
            }}>
                <div style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: highlight.color,
                    borderRadius: '2px',
                    border: '1px solid #ddd'
                }} />
                <span style={{ fontWeight: 'bold', flex: 1 }}>
                    {highlight.originalText.substring(0, 30)}
                    {highlight.originalText.length > 30 ? '...' : ''}
                </span>
            </div>
            <div style={{ color: '#666', fontSize: '10px' }}>
                {new Date(highlight.timestamp).toLocaleString()}
            </div>
        </div>
    )

    if (!selectedRange) {
        return (
            <div style={{
                padding: '16px',
                backgroundColor: '#2d2d2d',
                color: '#ffffff',
                borderRadius: '8px',
                minWidth: '300px',
                maxWidth: '400px'
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
                    📝 Highlights
                </h3>

                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Page highlights: {highlights.length}
                    </div>
                    <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Total highlights: {stats.total}
                    </div>
                </div>

                {highlights.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
                            Recent highlights:
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {highlights.slice(0, 5).map((highlight) => (
                                <HighlightItem key={highlight.id} highlight={highlight} />
                            ))}
                        </div>
                    </div>
                )}

                {highlights.length > 0 && (
                    <button
                        onClick={handleClearAll}
                        style={{
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            width: '100%'
                        }}
                    >
                        Clear All Highlights
                    </button>
                )}

                <div style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#ccc',
                    textAlign: 'center'
                }}>
                    Select text to create highlights
                </div>
            </div>
        )
    }

    return (
        <div style={{
            padding: '16px',
            backgroundColor: '#2d2d2d',
            color: '#ffffff',
            borderRadius: '8px',
            minWidth: '300px',
            maxWidth: '400px'
        }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
                🖍️ Create Highlight
            </h3>

            {error && (
                <div style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    marginBottom: '12px',
                    fontSize: '14px'
                }}>
                    {error}
                </div>
            )}

            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    Selected text:
                </div>
                <div style={{
                    backgroundColor: '#404040',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    maxHeight: '80px',
                    overflowY: 'auto',
                    fontStyle: 'italic'
                }}>
                    "{selectedRange.toString().substring(0, 200)}
                    {selectedRange.toString().length > 200 ? '...' : ''}"
                </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    Color:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        style={{
                            width: '32px',
                            height: '32px',
                            backgroundColor: selectedColor,
                            border: '2px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    />
                    <span style={{ fontSize: '14px' }}>
                        {DEFAULT_COLORS.find(c => c.value === selectedColor)?.name || 'Custom'}
                    </span>
                </div>
            </div>

            {showColorPicker && <ColorPicker />}

            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={handleCreateHighlight}
                    disabled={isCreating}
                    style={{
                        backgroundColor: isCreating ? '#666' : '#007bff',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '4px',
                        cursor: isCreating ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        flex: 1
                    }}
                >
                    {isCreating ? 'Creating...' : 'Create Highlight'}
                </button>

                <button
                    onClick={onClose}
                    style={{
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        padding: '12px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Cancel
                </button>
            </div>

            <div style={{
                marginTop: '12px',
                fontSize: '12px',
                color: '#ccc',
                textAlign: 'center'
            }}>
                Right-click highlights to edit or delete
            </div>
        </div>
    )
}