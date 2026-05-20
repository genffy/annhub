const EUDIC_API_BASE = 'https://api.frdic.com/api/open/v1'

interface EudicApiResponse<T = unknown> {
    data?: T
    message?: string
}

interface EudicRequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    query?: Record<string, string | number | boolean | undefined>
    body?: Record<string, unknown>
}

const EUDIC_MAX_PAGE = 50
const EUDIC_MAX_PAGE_SIZE = 100

export interface EudicCategory {
    id: string
    language: string
    name: string
}

export interface EudicWord {
    word: string
    phon?: string
    exp?: string
    add_time?: string
    star?: number
    context_line?: string
}

export interface EudicWordDetail extends EudicWord {
    category_ids?: Array<string | number>
}

export interface EudicCategoryPayload {
    id: string
    language: string
    name: string
}

export interface EudicAddWordPayload {
    language?: string
    word: string
    star?: number
    contextLine?: string
    categoryIds?: string[]
}

export interface EudicBatchWordsPayload {
    categoryId: string
    words: string[]
    language?: string
}

async function eudicRequest<T>(
    token: string,
    path: string,
    options: EudicRequestOptions = {},
): Promise<EudicApiResponse<T> | T> {
    const { method = 'GET', query, body } = options

    const url = new URL(`${EUDIC_API_BASE}${path}`)
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined) {
                url.searchParams.set(key, String(value))
            }
        })
    }

    const response = await fetch(url.toString(), {
        method,
        headers: {
            'Authorization': token,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const raw = await response.text()

    if (!response.ok) {
        const fallbackError = `Eudic request failed: ${response.status}`
        let errorMessage = fallbackError
        try {
            const payload = JSON.parse(raw) as EudicApiResponse<unknown>
            if (payload.message) {
                errorMessage = payload.message
            }
        } catch {
            // Ignore non-JSON error bodies and keep fallback message.
        }
        throw new Error(errorMessage)
    }

    if (response.status === 204 || !raw.trim()) {
        return {}
    }

    return JSON.parse(raw) as EudicApiResponse<T> | T
}

function responseData<T>(payload: EudicApiResponse<T> | T): T | undefined {
    if (payload && typeof payload === 'object' && ('data' in payload || 'message' in payload)) {
        return (payload as EudicApiResponse<T>).data
    }
    return payload as T
}

function normalizePage(page: number): number {
    if (!Number.isFinite(page)) return 0
    return Math.min(EUDIC_MAX_PAGE, Math.max(0, Math.floor(page)))
}

function normalizePageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize)) return EUDIC_MAX_PAGE_SIZE
    return Math.min(EUDIC_MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)))
}

export async function fetchCategories(token: string, language = 'en'): Promise<EudicCategory[]> {
    const payload = await eudicRequest<EudicCategory[]>(token, '/studylist/category', {
        method: 'GET',
        query: { language },
    })
    return responseData(payload) ?? []
}

export async function createCategory(token: string, value: Omit<EudicCategoryPayload, 'id'>): Promise<EudicCategory> {
    const payload = await eudicRequest<EudicCategory>(token, '/studylist/category', {
        method: 'POST',
        body: {
            language: value.language,
            name: value.name,
        },
    })
    const data = responseData(payload)

    if (!data) {
        throw new Error((payload as EudicApiResponse<EudicCategory>).message || 'Failed to create Eudic category')
    }

    return data
}

export async function renameCategory(token: string, value: EudicCategoryPayload): Promise<void> {
    await eudicRequest(token, '/studylist/category', {
        method: 'PATCH',
        body: {
            id: value.id,
            language: value.language,
            name: value.name,
        },
    })
}

export async function deleteCategory(token: string, value: EudicCategoryPayload): Promise<void> {
    await eudicRequest(token, '/studylist/category', {
        method: 'DELETE',
        body: {
            id: value.id,
            language: value.language,
            name: value.name,
        },
    })
}

export async function fetchWords(
    token: string,
    categoryId: string,
    language = 'en',
    page = 0,
    pageSize = EUDIC_MAX_PAGE_SIZE,
): Promise<{ words: EudicWord[]; hasMore: boolean }> {
    const normalizedPage = normalizePage(page)
    const normalizedPageSize = normalizePageSize(pageSize)
    const payload = await eudicRequest<EudicWord[]>(token, '/studylist/words', {
        method: 'GET',
        query: {
            language,
            category_id: categoryId,
            page: normalizedPage,
            page_size: normalizedPageSize,
        },
    })

    const words = responseData(payload) ?? []
    return { words, hasMore: words.length === normalizedPageSize && normalizedPage < EUDIC_MAX_PAGE }
}

export async function addWordsToCategory(token: string, value: EudicBatchWordsPayload): Promise<void> {
    await eudicRequest(token, '/studylist/words', {
        method: 'POST',
        body: {
            language: value.language ?? 'en',
            category_id: value.categoryId,
            words: value.words,
        },
    })
}

export async function deleteWordsFromCategory(token: string, value: EudicBatchWordsPayload): Promise<void> {
    await eudicRequest(token, '/studylist/words', {
        method: 'DELETE',
        body: {
            language: value.language ?? 'en',
            category_id: value.categoryId,
            words: value.words,
        },
    })
}

export async function addWord(token: string, value: EudicAddWordPayload): Promise<void> {
    const language = value.language ?? 'en'
    const categoryIds = value.categoryIds?.filter(Boolean) ?? []

    // Eudic's singular `POST /studylist/word` endpoint accepts `category_ids`,
    // but in practice the field is unreliable for large numeric ids passed as
    // strings — words may silently fall back to the default category. The
    // plural `POST /studylist/words` endpoint takes a single `category_id`
    // string and is the canonical way to assign a category. When the caller
    // provides categories we route the word through the plural endpoint and
    // only use the singular endpoint to attach `star` / `context_line` after.
    if (categoryIds.length > 0) {
        for (const categoryId of categoryIds) {
            await eudicRequest(token, '/studylist/words', {
                method: 'POST',
                body: {
                    language,
                    category_id: categoryId,
                    words: [value.word],
                },
            })
        }

        // Star / context_line are not exposed on the plural endpoint. The
        // singular endpoint upserts these on the already-existing word; we
        // intentionally omit `category_ids` here so it does not move the word.
        if (value.star !== undefined || value.contextLine) {
            await eudicRequest(token, '/studylist/word', {
                method: 'POST',
                body: {
                    language,
                    word: value.word,
                    ...(value.star !== undefined ? { star: value.star } : {}),
                    ...(value.contextLine ? { context_line: value.contextLine } : {}),
                },
            })
        }
        return
    }

    await eudicRequest(token, '/studylist/word', {
        method: 'POST',
        body: {
            language,
            word: value.word,
            ...(value.star !== undefined ? { star: value.star } : {}),
            ...(value.contextLine ? { context_line: value.contextLine } : {}),
        },
    })
}

export async function getWord(token: string, word: string, language = 'en'): Promise<EudicWordDetail | null> {
    const payload = await eudicRequest<EudicWordDetail>(token, '/studylist/word', {
        method: 'GET',
        query: {
            language,
            word,
        },
    })
    return responseData(payload) ?? null
}

export async function fetchAllWords(
    token: string,
    categoryIds: string[],
    language = 'en',
): Promise<EudicWord[]> {
    const allWords: EudicWord[] = []

    for (const categoryId of categoryIds) {
        let page = 0
        let hasMore = true

        while (hasMore) {
            const result = await fetchWords(token, categoryId, language, page)
            allWords.push(...result.words)
            hasMore = result.hasMore
            page += 1
        }
    }

    return allWords
}
