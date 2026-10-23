// The favorites row of `emoji-picker-element` lives in the browser (IndexedDB). A browser without favorites gets a
// starter set once, each at count 1; a pick through `EmojiPicker` counts twice, so the user's own picks outrank them.

/** The part of the library's `Database` the seeding needs. */
export interface FavoriteEmojiStore {
    ready(): Promise<void>
    getTopFavoriteEmoji(limit: number): Promise<unknown[]>
    incrementFavoriteEmojiCount(unicode: string): Promise<void>
}

/** Spelled as in `emoji-picker-element-data` (some with VS16): a different spelling is not found and stays hidden. */
export const STARTER_EMOJI: string[] = [
    '\u{1F3B7}', // saxophone
    '\u{1F3B8}', // guitar
    '\u{1F3B9}', // musical keyboard
    '\u{1F3A7}️', // headphone
    '\u{1F4DA}️', // books
    '\u{1F4D6}', // open book
    '✍️', // writing hand
    '\u{1F3AC}️', // clapper board
    '\u{1F3AD}️', // performing arts
    '\u{1F3A8}', // artist palette
    '\u{1F4A1}', // light bulb
    '\u{1F9E0}', // brain
    '✈️', // airplane
    '\u{1F5FA}️', // world map
    '\u{1F3D4}️', // snow-capped mountain
    '\u{1F4BB}️', // laptop
    '\u{1F9EA}', // test tube
    '\u{1F373}', // cooking
    '\u{1F331}', // seedling
    '❤️', // red heart
]

/** Seeds the starter set only while the browser has no favorite at all. */
export async function seedFavoriteEmoji(db: FavoriteEmojiStore): Promise<void> {
    await db.ready()
    if ((await db.getTopFavoriteEmoji(1)).length > 0) return
    for (const unicode of STARTER_EMOJI) await db.incrementFavoriteEmojiCount(unicode)
}
