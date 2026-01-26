import { useEffect, useState } from 'react'
import { i18n } from '#i18n'

type ViewMode = 'highlights' | 'chats'

type StudyListCategory = {
    id: string
    language: string
    name: string
}

type StudyListWord = {
    word: string
    phon?: string
    exp?: string
    add_time?: string
    star?: number
    context_line?: string
}

const DEFAULT_LANGUAGE = 'en'
const WORDS_PAGE_SIZE = 100

const BR_DELIMITER = /<br\s*\/?\s*>/gi

const resolveAuthorizationToken = () => {
    const env = import.meta.env as Record<string, string | undefined>

    return (
        env.EUDIC_OPENAPI_AUTHORIZATION ??
        env.WXT_EUDIC_OPENAPI_AUTHORIZATION ??
        env.VITE_EUDIC_OPENAPI_AUTHORIZATION ??
        ''
    )
}

const splitRichText = (value?: string) =>
    value
        ? value
            .split(BR_DELIMITER)
            .map((line) => line.trim())
            .filter(Boolean)
        : []

const formatAddedTime = (value?: string) => {
    if (!value) {
        return ''
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date)
    } catch (error) {
        return date.toLocaleString()
    }
}

function App() {
    const [currentView, setCurrentView] = useState<ViewMode>('highlights')
    const [isLoadingCategories, setIsLoadingCategories] = useState(false)
    const [categoriesError, setCategoriesError] = useState<string | null>(null)
    const [categories, setCategories] = useState<StudyListCategory[]>([])
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

    const [isLoadingWords, setIsLoadingWords] = useState(false)
    const [wordsError, setWordsError] = useState<string | null>(null)
    const [words, setWords] = useState<StudyListWord[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [hasNextPage, setHasNextPage] = useState(false)

    useEffect(() => {
        const controller = new AbortController()

        const fetchCategories = async () => {
            const authorization = resolveAuthorizationToken()

            if (!authorization) {
                setCategoriesError('Missing authorization token')
                return
            }

            setIsLoadingCategories(true)
            setCategoriesError(null)

            try {
                const response = await fetch(
                    `https://api.frdic.com/api/open/v1/studylist/category?language=${encodeURIComponent(DEFAULT_LANGUAGE)}`,
                    {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            Authorization: authorization,
                        },
                        signal: controller.signal,
                    },
                )

                if (!response.ok) {
                    throw new Error(`Request failed with status ${response.status}`)
                }

                const payload = (await response.json()) as {
                    data?: StudyListCategory[]
                    message?: string
                }

                const nextCategories = payload.data ?? []
                setCategories(nextCategories)

                if (payload.message?.trim()) {
                    setCategoriesError(payload.message.trim())
                }

                if (nextCategories.length > 0) {
                    setSelectedCategoryId((prev) => prev ?? nextCategories[0].id)
                } else {
                    setSelectedCategoryId(null)
                }
            } catch (err) {
                if ((err as Error).name === 'AbortError') {
                    return
                }

                const message = err instanceof Error ? err.message : 'Unknown error'
                setCategoriesError(message)
                setCategories([])
                setSelectedCategoryId(null)
            } finally {
                setIsLoadingCategories(false)
            }
        }

        void fetchCategories()

        return () => {
            controller.abort()
        }
    }, [])

    useEffect(() => {
        setCurrentPage(1)
        setHasNextPage(false)
    }, [selectedCategoryId])

    useEffect(() => {
        if (!selectedCategoryId) {
            setWords([])
            setWordsError(null)
            setHasNextPage(false)
            return
        }

        const controller = new AbortController()

        const fetchWords = async () => {
            const authorization = resolveAuthorizationToken()

            if (!authorization) {
                setWordsError('Missing authorization token')
                setWords([])
                setHasNextPage(false)
                return
            }

            setIsLoadingWords(true)
            setWordsError(null)
            setWords([])
            setHasNextPage(false)

            try {
                const response = await fetch(
                    `https://api.frdic.com/api/open/v1/studylist/words?language=${encodeURIComponent(DEFAULT_LANGUAGE)}&category_id=${encodeURIComponent(selectedCategoryId)}&page=${currentPage}&page_size=${WORDS_PAGE_SIZE}`,
                    {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            Authorization: authorization,
                        },
                        signal: controller.signal,
                    },
                )

                if (!response.ok) {
                    throw new Error(`Request failed with status ${response.status}`)
                }

                const payload = (await response.json()) as {
                    data?: StudyListWord[]
                    message?: string
                }

                const rawWords = payload.data ?? []

                const nextWords = rawWords
                    .slice()
                    .sort((a, b) => {
                        const aTime = a.add_time ? Date.parse(a.add_time) : 0
                        const bTime = b.add_time ? Date.parse(b.add_time) : 0
                        return bTime - aTime
                    })

                setWords(nextWords)
                setHasNextPage(rawWords.length === WORDS_PAGE_SIZE)

                if (payload.message?.trim()) {
                    setWordsError(payload.message.trim())
                }
            } catch (err) {
                if ((err as Error).name === 'AbortError') {
                    return
                }

                const message = err instanceof Error ? err.message : 'Unknown error'
                setWordsError(message)
                setWords([])
                setHasNextPage(false)
            } finally {
                setIsLoadingWords(false)
            }
        }

        void fetchWords()

        return () => {
            controller.abort()
        }
    }, [selectedCategoryId, currentPage])

    const selectedCategory = selectedCategoryId
        ? categories.find((category) => category.id === selectedCategoryId) ?? null
        : null

    const selectedLanguageLabel = (selectedCategory?.language ?? DEFAULT_LANGUAGE).toUpperCase()
    const totalWords = words.length
    const hasCategories = categories.length > 0
    const canShowWords =
        !isLoadingCategories && !categoriesError && hasCategories && Boolean(selectedCategoryId && selectedCategory)

    const viewOptions = [
        { value: 'highlights', label: i18n.t('highlight.name'), icon: '📝' },
        { value: 'chats', label: i18n.t('sidepanel.name'), icon: '💬' },
    ]

    const handlePreviousPage = () => {
        if (currentPage === 1 || isLoadingWords) {
            return
        }

        setCurrentPage((prev) => Math.max(1, prev - 1))
    }

    const handleNextPage = () => {
        if (!hasNextPage || isLoadingWords) {
            return
        }

        setCurrentPage((prev) => prev + 1)
    }

    return (
        <div className="sidebar-container">
            <div className="sidebar-header">
                <div className="header-top">
                    <div className="header-meta">
                        <span className="header-eyebrow">Vocabulary books</span>
                        <span className="header-selected">
                            {selectedCategory?.name ?? 'Select a vocabulary book'}
                        </span>
                    </div>

                    <div className="view-selector">
                        <label className="sr-only" htmlFor="view-mode-selector">
                            View mode
                        </label>
                        <select
                            id="view-mode-selector"
                            value={currentView}
                            onChange={(event) => setCurrentView(event.target.value as ViewMode)}
                            className="view-select"
                        >
                            {viewOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.icon} {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="header-categories">
                    {isLoadingCategories && (
                        <div className="header-status">Loading vocabulary books…</div>
                    )}

                    {!isLoadingCategories && categoriesError && (
                        <div className="header-status header-status-error">{categoriesError}</div>
                    )}

                    {!isLoadingCategories && !categoriesError && !hasCategories && (
                        <div className="header-status">No vocabulary books found.</div>
                    )}

                    {!isLoadingCategories && !categoriesError && hasCategories && (
                        <div className="header-studylist-row">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    className={`studylist-card${selectedCategoryId === category.id ? ' active' : ''}`}
                                    onClick={() => setSelectedCategoryId(category.id)}
                                    aria-pressed={selectedCategoryId === category.id}
                                >
                                    <div className="studylist-name">{category.name}</div>
                                    <div className="studylist-meta">
                                        <span className="studylist-language">{category.language}</span>
                                        <span className="studylist-id">ID: {category.id}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="sidebar-content">
                <div className="studylist-section">
                    {canShowWords ? (
                        <div className="studylist-words">
                            <div className="studylist-toolbar">
                                <div className="toolbar-info">
                                    <span className="toolbar-eyebrow">Vocabulary book</span>
                                    <h2 className="toolbar-title">
                                        {selectedCategory?.name ?? 'Select a vocabulary book'}
                                    </h2>
                                    {selectedCategory && (
                                        <div className="toolbar-meta">
                                            <span className="toolbar-chip">{selectedLanguageLabel}</span>
                                            <span className="toolbar-separator" aria-hidden="true">
                                                •
                                            </span>
                                            <span className="toolbar-chip">
                                                {isLoadingWords ? 'Loading…' : `${totalWords} words`}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="toolbar-controls">
                                    <label className="sr-only" htmlFor="category-selector">
                                        Vocabulary book
                                    </label>
                                    <select
                                        id="category-selector"
                                        className="studylist-select"
                                        value={selectedCategoryId ?? ''}
                                        onChange={(event) => setSelectedCategoryId(event.target.value || null)}
                                    >
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="studylist-words-content">
                                {isLoadingWords && (
                                    <div className="section-status">Loading words…</div>
                                )}

                                {!isLoadingWords && wordsError && (
                                    <div className="section-status section-status-error">{wordsError}</div>
                                )}

                                {!isLoadingWords && !wordsError && words.length === 0 && (
                                    <div className="section-status">No words found in this list.</div>
                                )}

                                {!isLoadingWords && !wordsError && words.length > 0 && (
                                    <div className="words-grid">
                                        {words.map((word) => {
                                            const definitionLines = splitRichText(word.exp)
                                            const contextLines = splitRichText(word.context_line)

                                            return (
                                                <article
                                                    className="word-card"
                                                    key={`${word.word}-${word.add_time ?? ''}`}
                                                >
                                                    <div className="word-header">
                                                        <span className="word-text">{word.word}</span>
                                                        {typeof word.star === 'number' && word.star > 0 && (
                                                            <span
                                                                className="word-star"
                                                                aria-label={`Star level ${word.star}`}
                                                            >
                                                                ★ {word.star}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {word.phon && <div className="word-phon">{word.phon}</div>}

                                                    {definitionLines.length > 0 && (
                                                        <div className="word-exp">
                                                            {definitionLines.map((line, index) => (
                                                                <p key={index}>{line}</p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {contextLines.length > 0 && (
                                                        <div className="word-context">
                                                            {contextLines.map((line, index) => (
                                                                <p key={index}>{line}</p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {word.add_time && (
                                                        <div className="word-meta">Added {formatAddedTime(word.add_time)}</div>
                                                    )}
                                                </article>
                                            )
                                        })}
                                    </div>
                                )}
                                <div className="pagination-controls">
                                    <button
                                        type="button"
                                        className="pagination-button"
                                        onClick={handlePreviousPage}
                                        disabled={currentPage === 1 || isLoadingWords}
                                    >
                                        Prev
                                    </button>
                                    <span className="pagination-status">Page {currentPage}</span>
                                    <button
                                        type="button"
                                        className="pagination-button"
                                        onClick={handleNextPage}
                                        disabled={!hasNextPage || isLoadingWords}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={`section-status${categoriesError ? ' section-status-error' : ''}`}
                        >
                            {isLoadingCategories
                                ? 'Loading vocabulary books…'
                                : categoriesError ?? (hasCategories
                                    ? 'Select a vocabulary book above.'
                                    : 'No vocabulary books found.')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default App
