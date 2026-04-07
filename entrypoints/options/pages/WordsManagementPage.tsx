import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MessageUtils from '../../../utils/message'
import { normalizeWord, type VocabConfigPublic } from '../../../types/vocabulary'
import type { EudicCategory, EudicWord } from '../../../utils/eudic-openapi'

const ALL_CATEGORIES_ID = '__ALL_CATEGORIES__'
const WORDS_ROUTE_PATH = '/words'
const CATEGORY_QUERY_KEY = 'category'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

type SortMode = 'time-desc' | 'word-asc'
type MessageType = 'success' | 'error'
type OperationAction = '' | 'delete-selected' | 'rename-category' | 'delete-category'
type PaginationItem = number | 'ellipsis'

const getHashPathAndParams = (): { path: string; params: URLSearchParams } => {
    const rawHash = window.location.hash.replace(/^#/, '')
    const [path, query = ''] = rawHash.split('?')
    return {
        path: path || '',
        params: new URLSearchParams(query),
    }
}

const readCategoryIdFromHash = (): string | null => {
    const { path, params } = getHashPathAndParams()
    if (path !== WORDS_ROUTE_PATH) return null
    const value = params.get(CATEGORY_QUERY_KEY)?.trim()
    return value || null
}

const writeCategoryIdToHash = (categoryId: string): void => {
    const { path, params } = getHashPathAndParams()
    if (path !== WORDS_ROUTE_PATH) return

    if (!categoryId || categoryId === ALL_CATEGORIES_ID) {
        params.delete(CATEGORY_QUERY_KEY)
    } else {
        params.set(CATEGORY_QUERY_KEY, categoryId)
    }

    const nextHash = params.toString()
        ? `${WORDS_ROUTE_PATH}?${params.toString()}`
        : WORDS_ROUTE_PATH
    if (window.location.hash.replace(/^#/, '') === nextHash) {
        return
    }

    window.history.replaceState(null, '', `#${nextHash}`)
}

const stripHtml = (input?: string): string => {
    if (!input) return ''
    return input
        .replace(/<br\s*\/?>/gi, '; ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const parseAddTime = (value?: string): number => {
    if (!value) return 0
    const ts = new Date(value).getTime()
    return Number.isFinite(ts) ? ts : 0
}

const sortCategories = (items: EudicCategory[]): EudicCategory[] => {
    return [...items].sort((a, b) => {
        if (a.id === '0') return -1
        if (b.id === '0') return 1
        return a.name.localeCompare(b.name)
    })
}

const dedupeWords = (words: EudicWord[]): EudicWord[] => {
    const map = new Map<string, EudicWord>()

    for (const word of words) {
        const key = normalizeWord(word.word || '') || word.word.toLowerCase()
        const existing = map.get(key)
        if (!existing) {
            map.set(key, word)
            continue
        }

        if (parseAddTime(word.add_time) > parseAddTime(existing.add_time)) {
            map.set(key, word)
        }
    }

    return [...map.values()]
}

const renderStarLevel = (star?: number): string => {
    const level = Math.max(0, Math.min(5, Math.floor(star ?? 0)))
    return `${'★'.repeat(level)}${'☆'.repeat(5 - level)}`
}

const getWordKey = (word: string): string => {
    const normalized = normalizeWord(word)
    return normalized || word.toLowerCase().trim()
}

const buildPaginationItems = (currentPage: number, totalPages: number): PaginationItem[] => {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, idx) => idx + 1)
    }

    const items: PaginationItem[] = [1]

    let start = Math.max(2, currentPage - 1)
    let end = Math.min(totalPages - 1, currentPage + 1)

    if (currentPage <= 3) {
        start = 2
        end = 4
    }

    if (currentPage >= totalPages - 2) {
        start = totalPages - 3
        end = totalPages - 1
    }

    if (start > 2) {
        items.push('ellipsis')
    }

    for (let i = start; i <= end; i += 1) {
        items.push(i)
    }

    if (end < totalPages - 1) {
        items.push('ellipsis')
    }

    items.push(totalPages)
    return items
}

export default function WordsManagementPage() {
    const [savedEudicToken, setSavedEudicToken] = useState('')
    const [message, setMessage] = useState<{ text: string; type: MessageType } | null>(null)

    const [categories, setCategories] = useState<EudicCategory[]>([])
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => readCategoryIdFromHash() ?? '')
    const [rawWords, setRawWords] = useState<EudicWord[]>([])
    const [isLoadingCategories, setIsLoadingCategories] = useState(false)
    const [isLoadingWords, setIsLoadingWords] = useState(false)
    const [managerSearch, setManagerSearch] = useState('')
    const [managerSort, setManagerSort] = useState<SortMode>('time-desc')
    const [managerPage, setManagerPage] = useState(1)
    const [managerPageSize, setManagerPageSize] = useState<number>(25)
    const [managerJumpPage, setManagerJumpPage] = useState('1')
    const [operationAction, setOperationAction] = useState<OperationAction>('')
    const [selectedWordKeys, setSelectedWordKeys] = useState<Set<string>>(new Set())

    const [newCategoryName, setNewCategoryName] = useState('')
    const [newWord, setNewWord] = useState('')
    const [isCategorySubmitting, setIsCategorySubmitting] = useState(false)
    const [isWordSubmitting, setIsWordSubmitting] = useState(false)
    const [deletingWord, setDeletingWord] = useState<string | null>(null)
    const [isBatchDeleting, setIsBatchDeleting] = useState(false)

    const headerCheckboxRef = useRef<HTMLInputElement | null>(null)

    const canManageWords = Boolean(savedEudicToken)
    const selectedCategory = useMemo(
        () => categories.find(item => item.id === selectedCategoryId),
        [categories, selectedCategoryId],
    )
    const managerCategoryLabel = selectedCategoryId === ALL_CATEGORIES_ID
        ? '全部生词本'
        : (selectedCategory?.name || '未选择生词本')

    const showMessage = useCallback((text: string, type: MessageType = 'success') => {
        setMessage({ text, type })
        setTimeout(() => setMessage(null), 3500)
    }, [])

    const loadSavedToken = useCallback(async () => {
        try {
            const resp = await MessageUtils.sendMessage<VocabConfigPublic>({ type: 'GET_VOCAB_CONFIG' })
            if (resp.success && resp.data) {
                setSavedEudicToken(resp.data.hasEudicToken ? '__configured__' : '')
            }
        } catch (error) {
            console.error('[WordsManagementPage] Failed to load vocab config:', error)
        }
    }, [])

    const loadCategories = useCallback(async (): Promise<EudicCategory[]> => {
        if (!canManageWords) {
            setCategories([])
            return []
        }

        setIsLoadingCategories(true)
        try {
            const res = await MessageUtils.sendMessage<EudicCategory[]>({
                type: 'GET_EUDIC_CATEGORIES',
                language: 'en',
            })

            if (!res.success || !res.data) {
                throw new Error(res.error || 'Failed to load categories')
            }

            const next = sortCategories(res.data)
            setCategories(next)
            setSelectedCategoryId(prev => {
                if (prev && (prev === ALL_CATEGORIES_ID || next.some(item => item.id === prev))) {
                    return prev
                }

                const categoryIdFromHash = readCategoryIdFromHash()
                if (
                    categoryIdFromHash
                    && (categoryIdFromHash === ALL_CATEGORIES_ID || next.some(item => item.id === categoryIdFromHash))
                ) {
                    return categoryIdFromHash
                }

                return next[0]?.id ?? ALL_CATEGORIES_ID
            })
            return next
        } catch (error) {
            showMessage(`Failed to load categories: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
            return []
        } finally {
            setIsLoadingCategories(false)
        }
    }, [canManageWords, showMessage])

    const fetchAllWordsByCategory = useCallback(async (categoryId: string): Promise<EudicWord[]> => {
        const words: EudicWord[] = []
        // NOTE: OpenAPI `studylist/words` pagination is zero-based in practice.
        let page = 0
        let hasMore = true

        while (hasMore) {
            const res = await MessageUtils.sendMessage<{ words: EudicWord[]; hasMore: boolean }>({
                type: 'GET_EUDIC_WORDS',
                categoryId,
                language: 'en',
                page,
                pageSize: 200,
            })

            if (!res.success || !res.data) {
                throw new Error(res.error || 'Failed to load words')
            }

            words.push(...res.data.words)
            hasMore = res.data.hasMore
            page += 1
        }

        return words
    }, [])

    const loadWords = useCallback(async (
        categoryList: EudicCategory[] = categories,
        categoryIdOverride?: string,
    ) => {
        if (!canManageWords) {
            setRawWords([])
            return
        }

        const currentCategoryId = categoryIdOverride ?? selectedCategoryId
        if (!currentCategoryId) {
            setRawWords([])
            return
        }

        if (currentCategoryId !== ALL_CATEGORIES_ID && !categoryList.some(item => item.id === currentCategoryId)) {
            setRawWords([])
            return
        }

        setIsLoadingWords(true)
        try {
            if (currentCategoryId === ALL_CATEGORIES_ID) {
                const allWords: EudicWord[] = []
                for (const category of categoryList) {
                    const words = await fetchAllWordsByCategory(category.id)
                    allWords.push(...words)
                }
                setRawWords(dedupeWords(allWords))
            } else {
                const words = await fetchAllWordsByCategory(currentCategoryId)
                setRawWords(words)
            }
        } catch (error) {
            setRawWords([])
            showMessage(`Failed to load words: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsLoadingWords(false)
        }
    }, [canManageWords, categories, selectedCategoryId, fetchAllWordsByCategory, showMessage])

    useEffect(() => {
        void loadSavedToken()
    }, [loadSavedToken])

    useEffect(() => {
        if (!canManageWords) {
            setCategories([])
            setRawWords([])
            return
        }
        void loadCategories()
    }, [canManageWords, loadCategories])

    useEffect(() => {
        if (!canManageWords) {
            setRawWords([])
            return
        }
        void loadWords()
    }, [canManageWords, categories, selectedCategoryId, loadWords])

    useEffect(() => {
        if (!canManageWords || !selectedCategoryId) return
        writeCategoryIdToHash(selectedCategoryId)
    }, [canManageWords, selectedCategoryId])

    const handleCreateCategory = async () => {
        const name = newCategoryName.trim()
        if (!name) {
            showMessage('Please input category name', 'error')
            return
        }

        setIsCategorySubmitting(true)
        try {
            const res = await MessageUtils.sendMessage<EudicCategory>({
                type: 'CREATE_EUDIC_CATEGORY',
                name,
                language: 'en',
            })
            if (!res.success) {
                throw new Error(res.error || 'Failed to create category')
            }
            setNewCategoryName('')
            showMessage(`Category "${name}" created`)
            await loadCategories()
        } catch (error) {
            showMessage(`Create failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsCategorySubmitting(false)
        }
    }

    const handleRenameCategory = async () => {
        if (!selectedCategory || selectedCategoryId === ALL_CATEGORIES_ID) {
            showMessage('Please select one category first', 'error')
            return
        }

        const nextName = window.prompt('请输入新的生词本名称', selectedCategory.name)?.trim()
        if (!nextName || nextName === selectedCategory.name) {
            return
        }

        setIsCategorySubmitting(true)
        try {
            const res = await MessageUtils.sendMessage({
                type: 'RENAME_EUDIC_CATEGORY',
                id: selectedCategory.id,
                name: nextName,
                language: selectedCategory.language || 'en',
            })
            if (!res.success) {
                throw new Error(res.error || 'Failed to rename category')
            }
            showMessage('Category renamed')
            await loadCategories()
        } catch (error) {
            showMessage(`Rename failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsCategorySubmitting(false)
        }
    }

    const handleDeleteCategory = async () => {
        if (!selectedCategory || selectedCategoryId === ALL_CATEGORIES_ID) {
            showMessage('Please select one category first', 'error')
            return
        }
        if (selectedCategory.id === '0') {
            showMessage('Default category cannot be deleted', 'error')
            return
        }

        const confirmed = window.confirm(`确定删除生词本 "${selectedCategory.name}" 吗？`)
        if (!confirmed) return

        setIsCategorySubmitting(true)
        try {
            const res = await MessageUtils.sendMessage({
                type: 'DELETE_EUDIC_CATEGORY',
                id: selectedCategory.id,
                name: selectedCategory.name,
                language: selectedCategory.language || 'en',
            })
            if (!res.success) {
                throw new Error(res.error || 'Failed to delete category')
            }

            showMessage('Category deleted')

            const nextCategories = await loadCategories()
            const fallbackCategoryId = nextCategories[0]?.id ?? ALL_CATEGORIES_ID
            setSelectedCategoryId(fallbackCategoryId)
            await loadWords(nextCategories, fallbackCategoryId)
        } catch (error) {
            showMessage(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsCategorySubmitting(false)
        }
    }

    const deleteWordsInCurrentScope = useCallback(async (words: string[]) => {
        const uniqueWords = [...new Map(words.map(item => [getWordKey(item), item])).values()]
        if (uniqueWords.length === 0) return

        if (selectedCategoryId === ALL_CATEGORIES_ID) {
            for (const word of uniqueWords) {
                const detailRes = await MessageUtils.sendMessage<{ category_ids?: Array<string | number> }>({
                    type: 'GET_EUDIC_WORD',
                    word,
                    language: 'en',
                })
                if (!detailRes.success || !detailRes.data) {
                    throw new Error(detailRes.error || 'Failed to query categories for this word')
                }

                const categoryIds = (detailRes.data.category_ids || []).map(String)
                if (categoryIds.length === 0) {
                    continue
                }

                for (const categoryId of categoryIds) {
                    const deleteRes = await MessageUtils.sendMessage({
                        type: 'DELETE_EUDIC_WORDS',
                        categoryId,
                        words: [word],
                        language: 'en',
                    })
                    if (!deleteRes.success) {
                        throw new Error(deleteRes.error || `Failed to delete word "${word}"`)
                    }
                }
            }
            return
        }

        const deleteRes = await MessageUtils.sendMessage({
            type: 'DELETE_EUDIC_WORDS',
            categoryId: selectedCategoryId,
            words: uniqueWords,
            language: 'en',
        })
        if (!deleteRes.success) {
            throw new Error(deleteRes.error || 'Failed to delete words')
        }
    }, [selectedCategoryId])

    const handleAddWord = async () => {
        const word = newWord.trim()
        if (!word) {
            showMessage('Please input a word', 'error')
            return
        }
        if (selectedCategoryId === ALL_CATEGORIES_ID) {
            showMessage('Please select one category before adding a word', 'error')
            return
        }

        setIsWordSubmitting(true)
        try {
            const res = await MessageUtils.sendMessage({
                type: 'ADD_EUDIC_WORD',
                word,
                language: 'en',
                categoryIds: [selectedCategoryId],
            })
            if (!res.success) {
                throw new Error(res.error || 'Failed to add word')
            }
            setNewWord('')
            showMessage(`Added "${word}"`)
            await loadWords()
        } catch (error) {
            showMessage(`Add failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsWordSubmitting(false)
        }
    }

    const handleDeleteWord = async (word: string) => {
        const confirmed = window.confirm(`确认删除单词 "${word}" 吗？`)
        if (!confirmed) return

        setDeletingWord(word)
        try {
            await deleteWordsInCurrentScope([word])
            setSelectedWordKeys(prev => {
                const next = new Set(prev)
                next.delete(getWordKey(word))
                return next
            })
            showMessage(`Deleted "${word}"`)
            await loadWords()
        } catch (error) {
            showMessage(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setDeletingWord(null)
        }
    }

    const displayedWords = useMemo(() => {
        const keyword = managerSearch.trim().toLowerCase()
        let next = rawWords

        if (keyword) {
            next = next.filter(item => {
                const text = `${item.word} ${stripHtml(item.exp)}`.toLowerCase()
                return text.includes(keyword)
            })
        }

        const sorted = [...next]
        if (managerSort === 'word-asc') {
            sorted.sort((a, b) => a.word.localeCompare(b.word))
        } else {
            sorted.sort((a, b) => parseAddTime(b.add_time) - parseAddTime(a.add_time))
        }

        return sorted
    }, [rawWords, managerSearch, managerSort])

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(displayedWords.length / managerPageSize))
    }, [displayedWords.length, managerPageSize])

    useEffect(() => {
        setManagerPage(1)
    }, [selectedCategoryId, managerSearch, managerSort, managerPageSize])

    useEffect(() => {
        setSelectedWordKeys(new Set())
    }, [selectedCategoryId])

    useEffect(() => {
        setManagerPage(prev => Math.min(prev, totalPages))
    }, [totalPages])

    useEffect(() => {
        setManagerJumpPage(String(managerPage))
    }, [managerPage])

    const currentPageWords = useMemo(() => {
        const start = (managerPage - 1) * managerPageSize
        const end = start + managerPageSize
        return displayedWords.slice(start, end)
    }, [displayedWords, managerPage, managerPageSize])

    const selectedWordList = useMemo(() => {
        const map = new Map<string, string>()
        for (const word of displayedWords) {
            const key = getWordKey(word.word)
            if (selectedWordKeys.has(key) && !map.has(key)) {
                map.set(key, word.word)
            }
        }
        return [...map.values()]
    }, [displayedWords, selectedWordKeys])

    const currentPageWordKeys = useMemo(() => {
        return currentPageWords.map(item => getWordKey(item.word))
    }, [currentPageWords])

    const isAllCurrentPageSelected = currentPageWordKeys.length > 0
        && currentPageWordKeys.every(key => selectedWordKeys.has(key))
    const isPartCurrentPageSelected = currentPageWordKeys.some(key => selectedWordKeys.has(key))
        && !isAllCurrentPageSelected

    useEffect(() => {
        if (!headerCheckboxRef.current) return
        headerCheckboxRef.current.indeterminate = isPartCurrentPageSelected
    }, [isPartCurrentPageSelected])

    const paginationItems = useMemo(
        () => buildPaginationItems(managerPage, totalPages),
        [managerPage, totalPages],
    )

    const handleToggleAllCurrentPage = (checked: boolean) => {
        setSelectedWordKeys(prev => {
            const next = new Set(prev)
            for (const key of currentPageWordKeys) {
                if (checked) {
                    next.add(key)
                } else {
                    next.delete(key)
                }
            }
            return next
        })
    }

    const handleBatchDelete = async () => {
        if (selectedWordList.length === 0) {
            showMessage('请先勾选要删除的单词', 'error')
            return
        }

        const confirmed = window.confirm(`确认删除选中的 ${selectedWordList.length} 个单词吗？`)
        if (!confirmed) return

        setIsBatchDeleting(true)
        try {
            await deleteWordsInCurrentScope(selectedWordList)
            showMessage(`Deleted ${selectedWordList.length} words`)
            setSelectedWordKeys(new Set())
            await loadWords()
        } catch (error) {
            showMessage(`Batch delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
        } finally {
            setIsBatchDeleting(false)
        }
    }

    const handleOperationSelect = async (action: OperationAction) => {
        if (!action) return

        if (action === 'delete-selected') {
            await handleBatchDelete()
            return
        }

        if (action === 'rename-category') {
            await handleRenameCategory()
            return
        }

        if (action === 'delete-category') {
            await handleDeleteCategory()
        }
    }

    const handleJumpToPage = () => {
        const parsed = Number.parseInt(managerJumpPage, 10)
        if (!Number.isFinite(parsed)) {
            setManagerJumpPage(String(managerPage))
            return
        }

        const next = Math.min(totalPages, Math.max(1, parsed))
        setManagerPage(next)
    }

    return (
        <div className="content-section">
            <h2>Words Management</h2>
            <div className="vocab-settings">
                {message && (
                    <div className={`settings-message ${message.type === 'error' ? 'settings-message--error' : ''}`}>
                        {message.text}
                    </div>
                )}

                {!canManageWords && (
                    <div className="vocab-manager-empty">
                        Please configure and save Eudic token in Settings → Vocabulary Labeling first.
                    </div>
                )}

                {canManageWords && (
                    <div className="vocab-manager">
                        <aside className="vocab-manager-sidebar">
                            <div className="vocab-manager-sidebar-header">
                                <span>生词本</span>
                                <button
                                    type="button"
                                    onClick={() => { void loadCategories() }}
                                    disabled={isLoadingCategories}
                                >
                                    {isLoadingCategories ? '刷新中…' : '刷新'}
                                </button>
                            </div>

                            <div className="vocab-manager-create">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    placeholder="新建生词本名称"
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateCategory}
                                    disabled={isCategorySubmitting || !newCategoryName.trim()}
                                >
                                    新建
                                </button>
                            </div>

                            <button
                                type="button"
                                className={`vocab-manager-category ${selectedCategoryId === ALL_CATEGORIES_ID ? 'active' : ''}`}
                                onClick={() => setSelectedCategoryId(ALL_CATEGORIES_ID)}
                            >
                                全部生词本
                            </button>

                            <div className="vocab-manager-category-list">
                                {categories.map((category) => (
                                    <button
                                        key={category.id}
                                        type="button"
                                        className={`vocab-manager-category ${selectedCategoryId === category.id ? 'active' : ''}`}
                                        onClick={() => setSelectedCategoryId(category.id)}
                                    >
                                        <span className="vocab-manager-category-name">{category.name}</span>
                                    </button>
                                ))}
                            </div>
                        </aside>

                        <div className="vocab-manager-main">
                            <div className="vocab-manager-header">
                                <div>
                                    <h4>{managerCategoryLabel}</h4>
                                    <p>共{rawWords.length}词</p>
                                </div>
                                <div className="vocab-manager-header-actions">
                                    <label className="vocab-manager-toolbar-item vocab-manager-toolbar-search">
                                        <span>搜索：</span>
                                        <input
                                            type="text"
                                            value={managerSearch}
                                            onChange={e => setManagerSearch(e.target.value)}
                                            placeholder="搜索"
                                        />
                                    </label>
                                    <label className="vocab-manager-toolbar-item">
                                        <select
                                            value={managerSort}
                                            onChange={e => setManagerSort(e.target.value as SortMode)}
                                        >
                                            <option value="time-desc">按时间排序</option>
                                            <option value="word-asc">按单词排序</option>
                                        </select>
                                    </label>
                                    <label className="vocab-manager-toolbar-item">
                                        <span className="vocab-manager-operation-label">操作</span>
                                        <select
                                            value={operationAction}
                                            onChange={e => {
                                                const action = e.target.value as OperationAction
                                                setOperationAction('')
                                                void handleOperationSelect(action)
                                            }}
                                        >
                                            <option value="">操作</option>
                                            <option
                                                value="delete-selected"
                                                disabled={selectedWordList.length === 0 || isBatchDeleting}
                                            >
                                                删除选中单词
                                            </option>
                                            <option
                                                value="rename-category"
                                                disabled={selectedCategoryId === ALL_CATEGORIES_ID || isCategorySubmitting}
                                            >
                                                重命名当前生词本
                                            </option>
                                            <option
                                                value="delete-category"
                                                disabled={
                                                    selectedCategoryId === ALL_CATEGORIES_ID
                                                    || selectedCategory?.id === '0'
                                                    || isCategorySubmitting
                                                }
                                            >
                                                删除当前生词本
                                            </option>
                                        </select>
                                    </label>
                                </div>
                            </div>

                            <div className="vocab-manager-word-actions">
                                <input
                                    type="text"
                                    value={newWord}
                                    onChange={e => setNewWord(e.target.value)}
                                    placeholder={selectedCategoryId === ALL_CATEGORIES_ID ? '请先选择生词本' : '输入要添加的单词'}
                                    disabled={selectedCategoryId === ALL_CATEGORIES_ID}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddWord}
                                    disabled={isWordSubmitting || selectedCategoryId === ALL_CATEGORIES_ID || !newWord.trim()}
                                >
                                    {isWordSubmitting ? '添加中…' : '添加单词'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { void loadWords() }}
                                    disabled={isLoadingWords}
                                >
                                    {isLoadingWords ? '刷新中…' : '刷新词表'}
                                </button>
                            </div>

                            <div className="vocab-manager-table-wrapper">
                                <table className="vocab-manager-table">
                                    <thead>
                                        <tr>
                                            <th className="checkbox-col">
                                                <input
                                                    ref={headerCheckboxRef}
                                                    type="checkbox"
                                                    checked={isAllCurrentPageSelected}
                                                    onChange={e => handleToggleAllCurrentPage(e.target.checked)}
                                                    aria-label="Select current page"
                                                />
                                            </th>
                                            <th>序号</th>
                                            <th>单词</th>
                                            <th>音标</th>
                                            <th>释义</th>
                                            <th>等级</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoadingWords && (
                                            <tr>
                                                <td colSpan={7} className="vocab-manager-empty-row">词条加载中…</td>
                                            </tr>
                                        )}
                                        {!isLoadingWords && displayedWords.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="vocab-manager-empty-row">
                                                    {managerSearch.trim() ? '没有匹配结果' : '当前生词本暂无词条'}
                                                </td>
                                            </tr>
                                        )}
                                        {!isLoadingWords && currentPageWords.map((word, index) => {
                                            const wordKey = getWordKey(word.word)
                                            const absoluteIndex = (managerPage - 1) * managerPageSize + index + 1

                                            return (
                                                <tr key={`${word.word}-${word.add_time || absoluteIndex}`}>
                                                    <td className="checkbox-col">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedWordKeys.has(wordKey)}
                                                            onChange={e => {
                                                                setSelectedWordKeys(prev => {
                                                                    const next = new Set(prev)
                                                                    if (e.target.checked) {
                                                                        next.add(wordKey)
                                                                    } else {
                                                                        next.delete(wordKey)
                                                                    }
                                                                    return next
                                                                })
                                                            }}
                                                            aria-label={`Select ${word.word}`}
                                                        />
                                                    </td>
                                                    <td>{absoluteIndex}</td>
                                                    <td className="word">{word.word}</td>
                                                    <td>{stripHtml(word.phon) || '-'}</td>
                                                    <td className="exp" title={stripHtml(word.exp)}>
                                                        {stripHtml(word.exp) || '-'}
                                                    </td>
                                                    <td>{renderStarLevel(word.star)}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="link-danger"
                                                            onClick={() => { void handleDeleteWord(word.word) }}
                                                            disabled={deletingWord === word.word}
                                                        >
                                                            {deletingWord === word.word ? '删除中…' : '删除'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="vocab-manager-pagination">
                                <div className="vocab-manager-pagination-main">
                                    <button
                                        type="button"
                                        className="page-btn"
                                        onClick={() => setManagerPage(prev => Math.max(1, prev - 1))}
                                        disabled={managerPage <= 1}
                                    >
                                        &lt;
                                    </button>
                                    {paginationItems.map((item, idx) => (
                                        item === 'ellipsis'
                                            ? <span key={`ellipsis-${idx}`} className="page-ellipsis">…</span>
                                            : (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    className={`page-btn ${managerPage === item ? 'active' : ''}`}
                                                    onClick={() => setManagerPage(item)}
                                                >
                                                    {item}
                                                </button>
                                            )
                                    ))}
                                    <button
                                        type="button"
                                        className="page-btn"
                                        onClick={() => setManagerPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={managerPage >= totalPages}
                                    >
                                        &gt;
                                    </button>
                                </div>

                                <div className="vocab-manager-pagination-jump">
                                    <span>第</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={managerJumpPage}
                                        onChange={e => setManagerJumpPage(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                handleJumpToPage()
                                            }
                                        }}
                                    />
                                    <span>页</span>
                                    <button
                                        type="button"
                                        className="page-jump-btn"
                                        onClick={handleJumpToPage}
                                    >
                                        转到
                                    </button>
                                </div>

                                <div className="vocab-manager-pagination-size">
                                    <select
                                        value={managerPageSize}
                                        onChange={e => setManagerPageSize(Number(e.target.value))}
                                    >
                                        {PAGE_SIZE_OPTIONS.map(size => (
                                            <option key={size} value={size}>{size} 条/页</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
