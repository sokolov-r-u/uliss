// The emoji picker's data, bundled from emoji-picker-element-data and served by this app (no CDN); the hashed name
// lets the browser cache it, and nginx's ETag lets the library revalidate it cheaply.
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url'

export const EMOJI_DATA_URL: string = emojiDataUrl
