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
): Promise<EudicApiResponse<T>> {
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
            'User-Agent': 'Mozilla/5.0',
            'Authorization': token,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
        const fallbackError = `Eudic request failed: ${response.status}`
        let errorMessage = fallbackError
        try {
            const payload = await response.json() as EudicApiResponse<unknown>
            if (payload.message) {
                errorMessage = payload.message
            }
        } catch {
            // Ignore non-JSON error bodies and keep fallback message.
        }
        throw new Error(errorMessage)
    }

    if (response.status === 204) {
        return {}
    }

    const raw = await response.text()
    if (!raw.trim()) {
        return {}
    }

    return JSON.parse(raw) as EudicApiResponse<T>
}

export async function fetchCategories(token: string, language = 'en'): Promise<EudicCategory[]> {
    const payload = await eudicRequest<EudicCategory[]>(token, '/studylist/category', {
        method: 'GET',
        query: { language },
    })
    return payload.data ?? []
}

export async function createCategory(token: string, value: Omit<EudicCategoryPayload, 'id'>): Promise<EudicCategory> {
    const payload = await eudicRequest<EudicCategory>(token, '/studylist/category', {
        method: 'POST',
        body: {
            language: value.language,
            name: value.name,
        },
    })

    if (!payload.data) {
        throw new Error(payload.message || 'Failed to create Eudic category')
    }

    return payload.data
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
    // NOTE: OpenAPI `studylist/words` pagination is zero-based in practice.
    page = 0,
    pageSize = 100,
): Promise<{ words: EudicWord[]; hasMore: boolean }> {
    const payload = await eudicRequest<EudicWord[]>(token, '/studylist/words', {
        method: 'GET',
        query: {
            language,
            category_id: categoryId,
            page,
            page_size: pageSize,
        },
    })

    const words = payload.data ?? []
    return { words, hasMore: words.length === pageSize }
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
    await eudicRequest(token, '/studylist/word', {
        method: 'POST',
        body: {
            language: value.language ?? 'en',
            word: value.word,
            ...(value.star !== undefined ? { star: value.star } : {}),
            ...(value.contextLine ? { context_line: value.contextLine } : {}),
            ...(value.categoryIds && value.categoryIds.length > 0 ? { category_ids: value.categoryIds } : {}),
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
    return payload.data ?? null
}

export async function fetchAllWords(
    token: string,
    categoryIds: string[],
    language = 'en',
): Promise<EudicWord[]> {
    const allWords: EudicWord[] = []

    for (const categoryId of categoryIds) {
        // NOTE: OpenAPI `studylist/words` pagination is zero-based in practice.
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
