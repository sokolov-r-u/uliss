import {describe, expect, it, vi} from 'vitest'
import {type FavoriteEmojiStore, seedFavoriteEmoji, STARTER_EMOJI} from './emojiFavorites'

function store(favorites: string[]): FavoriteEmojiStore & { counts: Map<string, number> } {
    const counts = new Map(favorites.map((unicode) => [unicode, 1]))
    return {
        counts,
        ready: vi.fn(async () => undefined),
        getTopFavoriteEmoji: vi.fn(async (limit: number) => [...counts.keys()].slice(0, limit).map((unicode) => ({unicode}))),
        incrementFavoriteEmojiCount: vi.fn(async (unicode: string) => {
            counts.set(unicode, (counts.get(unicode) ?? 0) + 1)
        }),
    }
}

describe('seedFavoriteEmoji', () => {
    it('gives a browser without favorites the starter set, each once', async () => {
        const db = store([])

        await seedFavoriteEmoji(db)

        expect([...db.counts.keys()]).toEqual(STARTER_EMOJI)
        expect([...db.counts.values()].every((count) => count === 1)).toBe(true)
    })

    it('leaves favorites the user already has alone', async () => {
        const db = store(['🦊'])

        await seedFavoriteEmoji(db)

        expect(db.incrementFavoriteEmojiCount).not.toHaveBeenCalled()
        expect([...db.counts.keys()]).toEqual(['🦊'])
    })

    it('waits for the emoji data before it reads the favorites', async () => {
        const db = store([])
        let loaded = false
        db.ready = vi.fn(async () => {
            loaded = true
        })
        db.getTopFavoriteEmoji = vi.fn(async () => {
            expect(loaded).toBe(true)
            return []
        })

        await seedFavoriteEmoji(db)

        expect(db.getTopFavoriteEmoji).toHaveBeenCalledWith(1)
    })

    it('is a meaningful set of 16 to 24 distinct emoji', () => {
        expect(STARTER_EMOJI.length).toBeGreaterThanOrEqual(16)
        expect(STARTER_EMOJI.length).toBeLessThanOrEqual(24)
        expect(new Set(STARTER_EMOJI).size).toBe(STARTER_EMOJI.length)
    })
})
