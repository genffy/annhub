import { useEffect, useState, useMemo } from 'react'
import type { VocabSnapshot, VocabSyncState } from '../../types/vocabulary'

type SortMode = 'alpha' | 'proficiency' | 'recent'

const formatTime = (ts: number) => {
    if (!ts) return 'Never'
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(ts))
    } catch {
        return new Date(ts).toLocaleString()
    }
}

function App() {
    const [snapshot, setSnapshot] = useState<VocabSnapshot | null>(null)
    const [syncState, setSyncState] = useState<VocabSyncState | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortMode, setSortMode] = useState<SortMode>('alpha')

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true)
            try {
                const result = await chrome.storage.local.get(['vocabSnapshot', 'vocabSyncState'])
                setSnapshot((result.vocabSnapshot as VocabSnapshot | undefined) ?? null)
                setSyncState((result.vocabSyncState as VocabSyncState | undefined) ?? null)
            } catch (err) {
                console.error('Failed to load vocab data:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadData()

        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.vocabSnapshot) {
                setSnapshot(
                    (changes.vocabSnapshot.newValue as VocabSnapshot | undefined) ?? null,
                )
            }
            if (changes.vocabSyncState) {
                setSyncState(
                    (changes.vocabSyncState.newValue as VocabSyncState | undefined) ?? null,
                )
            }
        }
        chrome.storage.local.onChanged.addListener(listener)
        return () => chrome.storage.local.onChanged.removeListener(listener)
    }, [])

    const wordEntries = useMemo(() => {
        if (!snapshot) return []

        let entries = Object.entries(snapshot.entries).map(([word, data]) => ({
            word,
            ...data,
        }))

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim()
            entries = entries.filter(e => e.word.toLowerCase().includes(q))
        }

        switch (sortMode) {
            case 'alpha':
                entries.sort((a, b) => a.word.localeCompare(b.word))
                break
            case 'proficiency':
                entries.sort((a, b) => (a.proficiency ?? 0) - (b.proficiency ?? 0))
                break
            case 'recent':
                // Snapshot doesn't have per-word timestamps; keep original order
                break
        }

        return entries
    }, [snapshot, searchQuery, sortMode])

    const totalWords = snapshot ? Object.keys(snapshot.entries).length : 0

    if (isLoading) {
        return (
            <div className="sidebar-container">
                <div className="section-status">Loading vocabulary data...</div>
            </div>
        )
    }

    return (
        <div className="sidebar-container">
            <div className="sidebar-header">
                <div className="header-top">
                    <div className="header-meta">
                        <span className="header-eyebrow">Vocabulary Snapshot</span>
                        <span className="header-selected">{totalWords} words</span>
                    </div>
                </div>

                <div className="header-categories">
                    <div className="sync-status">
                        <span>Last sync: {syncState ? formatTime(syncState.lastSyncAt) : 'Never'}</span>
                        {syncState?.lastSyncStatus === 'error' && (
                            <span className="header-status-error"> — {syncState.lastError ?? 'Error'}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="sidebar-content">
                <div className="studylist-section">
                    <div className="studylist-words">
                        <div className="studylist-toolbar">
                            <div className="toolbar-info">
                                <h2 className="toolbar-title">Words</h2>
                                <div className="toolbar-meta">
                                    <span className="toolbar-chip">{wordEntries.length} shown</span>
                                </div>
                            </div>
                            <div className="toolbar-controls">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search words..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                <select
                                    className="studylist-select"
                                    value={sortMode}
                                    onChange={e => setSortMode(e.target.value as SortMode)}
                                >
                                    <option value="alpha">A-Z</option>
                                    <option value="proficiency">Proficiency</option>
                                    <option value="recent">Default</option>
                                </select>
                            </div>
                        </div>

                        <div className="studylist-words-content">
                            {!snapshot && (
                                <div className="section-status">
                                    No vocabulary data yet. Configure sync in Options.
                                </div>
                            )}

                            {snapshot && wordEntries.length === 0 && (
                                <div className="section-status">
                                    {searchQuery ? 'No matching words found.' : 'No words in snapshot.'}
                                </div>
                            )}

                            {wordEntries.length > 0 && (
                                <div className="words-grid">
                                    {wordEntries.map(entry => {
                                        const definitionLines = entry.exp
                                            ? entry.exp.split(/<br\s*\/?\s*>/gi).map(l => l.trim()).filter(Boolean)
                                            : []

                                        return (
                                            <article className="word-card" key={entry.word}>
                                                <div className="word-header">
                                                    <span className="word-text">{entry.word}</span>
                                                    {typeof entry.star === 'number' && entry.star > 0 && (
                                                        <span className="word-star" aria-label={`Star level ${entry.star}`}>
                                                            ★ {entry.star}
                                                        </span>
                                                    )}
                                                    <span className="word-proficiency">
                                                        P{entry.proficiency}
                                                    </span>
                                                </div>
                                                {definitionLines.length > 0 && (
                                                    <div className="word-exp">
                                                        {definitionLines.map((line, i) => (
                                                            <p key={i}>{line}</p>
                                                        ))}
                                                    </div>
                                                )}
                                            </article>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
