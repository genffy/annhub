import { useState, useEffect } from 'react'
import { HighlightRecord, HighlightQuery } from '../../../types/highlight'
import MessageUtils from '../../../utils/message'
import './index.style.css'

interface HighlightListProps {
    className?: string
    showHeader?: boolean
    showPagination?: boolean
    initialPageSize?: number
    onHighlightClick?: (highlight: HighlightRecord) => void
    alwaysNewTab?: boolean
}

interface PaginationInfo {
    currentPage: number
    pageSize: number
    total: number
    totalPages: number
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100]

export default function HighlightList({
    className = '',
    showHeader = true,
    showPagination = true,
    initialPageSize = 20,
    onHighlightClick,
    alwaysNewTab = false
}: HighlightListProps) {
    const [highlights, setHighlights] = useState<HighlightRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived' | 'deleted'>('all')
    const [pagination, setPagination] = useState<PaginationInfo>({
        currentPage: 1,
        pageSize: initialPageSize,
        total: 0,
        totalPages: 0
    })


    const loadHighlights = async () => {
        setLoading(true)
        setError(null)

        try {

            const query: HighlightQuery = {
                status: statusFilter === 'all' ? undefined : statusFilter,
                limit: pagination.pageSize,
                offset: (pagination.currentPage - 1) * pagination.pageSize
            }


            const response = await MessageUtils.sendMessage({
                type: 'GET_HIGHLIGHTS',
                query: query
            })

            if (!response.success) {
                throw new Error(response.error || i18n.t("network.error"))
            }

            const allHighlights = response.data as HighlightRecord[]


            let filteredHighlights = allHighlights
            if (searchQuery.trim()) {
                const searchTerm = searchQuery.toLowerCase()
                filteredHighlights = allHighlights.filter((h: HighlightRecord) =>
                    h.originalText.toLowerCase().includes(searchTerm) ||
                    h.metadata.pageTitle.toLowerCase().includes(searchTerm) ||
                    h.url.toLowerCase().includes(searchTerm)
                )
            }


            const total = filteredHighlights.length
            const totalPages = Math.ceil(total / pagination.pageSize)
            setPagination(prev => ({
                ...prev,
                total,
                totalPages
            }))


            const offset = (pagination.currentPage - 1) * pagination.pageSize
            const currentPageHighlights = filteredHighlights.slice(offset, offset + pagination.pageSize)

            setHighlights(currentPageHighlights)
        } catch (err) {
            setError(err instanceof Error ? err.message : i18n.t("network.error"))
        } finally {
            setLoading(false)
        }
    }


    const handleHighlightClick = async (highlight: HighlightRecord) => {
        if (onHighlightClick) {
            onHighlightClick(highlight)
        } else {

            try {
                const response = await MessageUtils.sendMessage({
                    type: 'LOCATE_HIGHLIGHT',
                    data: {
                        id: highlight.id
                    }
                })

                if (!response.success) {
                    console.error('Failed to locate highlight:', response.error)
                }
            } catch (err) {
                console.error('Failed to locate highlight:', err)
            }
        }
    }


    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
    }


    const truncateText = (text: string, maxLength: number = 200) => {
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength) + '...'
    }


    const handlePageSizeChange = (newPageSize: number) => {
        setPagination(prev => ({
            ...prev,
            pageSize: newPageSize,
            currentPage: 1
        }))
    }


    const handlePageChange = (newPage: number) => {
        setPagination(prev => ({
            ...prev,
            currentPage: newPage
        }))
    }


    const handleSearch = (query: string) => {
        setSearchQuery(query)
        setPagination(prev => ({
            ...prev,
            currentPage: 1
        }))
    }


    const handleStatusFilter = (status: typeof statusFilter) => {
        setStatusFilter(status)
        setPagination(prev => ({
            ...prev,
            currentPage: 1
        }))
    }


    useEffect(() => {
        loadHighlights()
    }, [pagination.currentPage, pagination.pageSize, statusFilter, searchQuery])

    return (
        <div className={`highlight-list ${className}`}>
            {showHeader && (
                <div className="highlight-list-header">
                    <div className="header-title">
                        <h3>{i18n.t('highlights')}</h3>
                        <span className="total-count">{i18n.t('pagination.total', [pagination.total])}</span>
                    </div>

                    <div className="header-controls">
                        <div className="search-box">
                            <input
                                type="text"
                                placeholder={`${i18n.t('search')}...`}
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="search-input"
                            />
                        </div>

                        <div className="filter-box">
                            <select
                                value={statusFilter}
                                onChange={(e) => handleStatusFilter(e.target.value as typeof statusFilter)}
                                className="filter-select"
                            >
                                <option value="all">{i18n.t('highlight.status.all')}</option>
                                <option value="active">{i18n.t('highlight.status.active')}</option>
                                <option value="archived">{i18n.t('highlight.status.archived')}</option>
                                <option value="deleted">{i18n.t('highlight.status.deleted')}</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <div className="highlight-list-content">
                {loading && (
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <span>{i18n.t('network.loading')}</span>
                    </div>
                )}

                {error && (
                    <div className="error-state">
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                        <button onClick={loadHighlights} className="retry-button">
                            {i18n.t('network.retry')}
                        </button>
                    </div>
                )}

                {!loading && !error && highlights.length === 0 && (
                    <div className="empty-state">
                        <span className="empty-icon">📝</span>
                        <p>{i18n.t('noData')}</p>
                        <p className="empty-description">
                            {searchQuery ? i18n.t('noData') : i18n.t('noData')}
                        </p>
                    </div>
                )}

                {!loading && !error && highlights.length > 0 && (
                    <div className="highlight-items">
                        {highlights.map((highlight) => (
                            <div
                                key={highlight.id}
                                className="highlight-item"
                                onClick={() => handleHighlightClick(highlight)}
                            >
                                <div className="highlight-header">
                                    <div className="highlight-color" style={{ backgroundColor: highlight.color }}></div>
                                    <div className="highlight-meta">
                                        <span className="highlight-domain">{highlight.domain}</span>
                                        <span className="highlight-time">{formatTime(highlight.timestamp)}</span>
                                    </div>
                                    <div className="highlight-status">
                                        <span className={`status-badge status-${highlight.status}`}>
                                            {highlight.status === 'active' ? i18n.t('highlight.status.active') :
                                                highlight.status === 'archived' ? i18n.t('highlight.status.archived') : i18n.t('highlight.status.deleted')}
                                        </span>
                                    </div>
                                </div>

                                <div className="highlight-content">
                                    <h4 className="highlight-title">{highlight.metadata.pageTitle}</h4>
                                    <p className="highlight-text">{truncateText(highlight.originalText)}</p>
                                    {highlight.context.before && (
                                        <p className="highlight-context">
                                            <span className="context-label">{i18n.t('highlight.context')}:</span>
                                            <span className="context-text">
                                                ...{highlight.context.before}
                                                <mark style={{ backgroundColor: highlight.color }}>
                                                    {highlight.originalText.length > 50 ?
                                                        highlight.originalText.substring(0, 50) + '...' :
                                                        highlight.originalText}
                                                </mark>
                                                {highlight.context.after}...
                                            </span>
                                        </p>
                                    )}
                                </div>

                                <div className="highlight-actions">
                                    <button className="action-button primary">
                                        <span className="action-icon">🔗</span>
                                        <span>{i18n.t('highlight.viewDetail')}</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showPagination && pagination.totalPages > 1 && (
                <div className="highlight-pagination">
                    <div className="pagination-info">
                        <span>{i18n.t('pagination.pageSize')}</span>
                        <select
                            value={pagination.pageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                            className="page-size-select"
                        >
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span>{i18n.t('pagination.total', [pagination.total])}</span>
                    </div>

                    <div className="pagination-controls">
                        <button
                            onClick={() => handlePageChange(pagination.currentPage - 1)}
                            disabled={pagination.currentPage === 1}
                            className="pagination-button"
                        >
                            {i18n.t('pagination.previous')}
                        </button>

                        <div className="pagination-numbers">
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                const page = i + 1
                                return (
                                    <button
                                        key={page}
                                        onClick={() => handlePageChange(page)}
                                        className={`pagination-number ${pagination.currentPage === page ? 'active' : ''}`}
                                    >
                                        {page}
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            onClick={() => handlePageChange(pagination.currentPage + 1)}
                            disabled={pagination.currentPage === pagination.totalPages}
                            className="pagination-button"
                        >
                            {i18n.t('pagination.next')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
} 