import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllWords, fetchCategories, fetchWords, getWord } from '../eudic-openapi'

const fetchMock = vi.fn()

beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as any
})

function mockJsonResponse(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
    })
}

function requestUrlAt(index = 0): URL {
    const [url] = fetchMock.mock.calls[index]
    return new URL(url)
}

describe('Eudic OpenAPI wrapper', () => {
    it('fetches categories from data wrapper', async () => {
        mockJsonResponse({
            data: [
                { id: '0', language: 'en', name: 'Default' },
                { id: '123', language: 'en', name: 'Reading' },
            ],
            message: '',
        })

        const categories = await fetchCategories('NIS token', 'en')

        expect(categories).toHaveLength(2)
        expect(requestUrlAt().pathname).toBe('/api/open/v1/studylist/category')
        expect(requestUrlAt().searchParams.get('language')).toBe('en')
    })

    it('uses zero-based pagination for studylist words', async () => {
        mockJsonResponse({
            data: [{ word: 'action' }],
            message: '',
        })

        const result = await fetchWords('NIS token', '0', 'en')

        expect(result.words).toEqual([{ word: 'action' }])
        expect(result.hasMore).toBe(false)
        expect(requestUrlAt().pathname).toBe('/api/open/v1/studylist/words')
        expect(requestUrlAt().searchParams.get('page')).toBe('0')
        expect(requestUrlAt().searchParams.get('page_size')).toBe('100')
    })

    it('clamps page and page size to Eudic documented bounds', async () => {
        mockJsonResponse({
            data: Array.from({ length: 100 }, (_, index) => ({ word: `word-${index}` })),
            message: '',
        })

        const result = await fetchWords('NIS token', '0', 'en', 99, 200)

        expect(result.hasMore).toBe(false)
        expect(requestUrlAt().searchParams.get('page')).toBe('50')
        expect(requestUrlAt().searchParams.get('page_size')).toBe('100')
    })

    it('fetches all words starting at page zero', async () => {
        mockJsonResponse({
            data: Array.from({ length: 100 }, (_, index) => ({ word: `page0-${index}` })),
            message: '',
        })
        mockJsonResponse({
            data: [{ word: 'page1-only' }],
            message: '',
        })

        const words = await fetchAllWords('NIS token', ['0'], 'en')

        expect(words).toHaveLength(101)
        expect(requestUrlAt(0).searchParams.get('page')).toBe('0')
        expect(requestUrlAt(1).searchParams.get('page')).toBe('1')
    })

    it('accepts bare object response from GET studylist word', async () => {
        mockJsonResponse({
            word: 'hello',
            exp: '',
            add_time: '2025-06-02T21:09:39Z',
            star: 2,
            context_line: '<b>hello</b>, how are you?',
            category_ids: [0],
        })

        const word = await getWord('NIS token', 'hello', 'en')

        expect(word).toMatchObject({
            word: 'hello',
            star: 2,
            category_ids: [0],
        })
        expect(requestUrlAt().searchParams.get('word')).toBe('hello')
    })
})
