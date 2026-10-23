import {type CSSProperties, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {Button} from '../actions/Button'
import {seedFavoriteEmoji} from './emojiFavorites'

// The full Unicode emoji set with search, favorites and skin tones: a wrapper over
// `emoji-picker-element`, loaded on first open, themed with our tokens. The box keeps
// its size while the library loads. The host serves the data (`dataSource`); no CDN.
// The library shows one row of favorites at its foot; ours are three rows on top,
// read from the same store, and the library's grid is three rows high.

export interface EmojiPickerProps {
    /** URL of `emoji-picker-element-data`'s `en/emojibase/data.json`, served by the app itself. */
    dataSource: string
    /** The picked emoji with its skin tone applied. */
    onPick: (emoji: string) => void
    /** Adds a "Remove the icon" action under the picker; pass it only while there is an icon. */
    onRemove?: () => void
    /** Fills its container: the favorites keep three rows, the grid takes the rest of the height. */
    fill?: boolean
}

interface EmojiClickDetail {
    unicode?: string
    emoji: { unicode?: string; name?: string }
}

interface StoredEmoji {
    unicode?: string
    annotation?: string
    skins?: { tone: number; unicode: string }[]
}

interface Favorite {
    /** The library's key: the emoji without a skin tone. */
    key: string
    label: string
    /** The emoji in each skin tone it has, by tone (1–5). */
    skins: Map<number, string>
}

const COLUMNS = 7
const FAVORITE_ROWS = 3
// px, not rem: the app scales its root font size for reading
const EMOJI_SIZE = 22
const EMOJI_PADDING = 8
const CELL = EMOJI_SIZE + 2 * EMOJI_PADDING
const FAVORITES_HEIGHT = FAVORITE_ROWS * CELL + 8
// the library's own rows: border, top pad, search, categories, indicator, a category label and three emoji rows
const LIBRARY_HEIGHT = 2 + EMOJI_PADDING + 39 + CELL + 4 + 29 + 3 * CELL
const REMOVE_HEIGHT = 44
/** The tallest box (with "Remove the icon"); it keeps its height while the library loads. */
export const EMOJI_PICKER_HEIGHT = FAVORITES_HEIGHT + LIBRARY_HEIGHT + REMOVE_HEIGHT
const WIDTH = 320

/** The library's own CSS variables, mapped to our tokens; square like the rest of the kit. */
const THEME = {
    width: '100%',
    height: '100%',
    '--background': 'var(--bg-panel)',
    '--border-color': 'var(--line)',
    '--border-size': '1px',
    '--border-radius': '0',
    '--button-active-background': 'var(--bg-muted)',
    '--button-hover-background': 'var(--bg-muted)',
    '--category-font-color': 'var(--text-muted)',
    '--category-font-size': '11px',
    '--indicator-color': 'var(--accent-2)',
    '--input-border-color': 'var(--line-strong)',
    '--input-border-radius': '0',
    '--input-font-color': 'var(--cream)',
    '--input-placeholder-color': 'var(--text-faint)',
    '--input-font-size': '14px',
    '--input-padding': '4px',
    '--outline-color': 'var(--accent-2)',
    '--num-columns': String(COLUMNS),
    '--emoji-size': `${EMOJI_SIZE}px`,
    '--emoji-padding': `${EMOJI_PADDING}px`,
    '--skintone-border-radius': '0',
} as Record<string, string>

/** Injected into the library's shadow root (its README's way): our favorites replace its single row. */
const HIDE_LIBRARY_FAVORITES = '.favorites { display: none; }'

function toFavorite(emoji: StoredEmoji): Favorite | null {
    if (!emoji.unicode) return null
    return {
        key: emoji.unicode,
        label: emoji.annotation ?? emoji.unicode,
        skins: new Map((emoji.skins ?? []).map((skin) => [skin.tone, skin.unicode])),
    }
}

const FAVORITE_BUTTON: CSSProperties = {
    width: CELL,
    height: CELL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 0,
    background: 'transparent',
    fontSize: EMOJI_SIZE,
    lineHeight: 1,
    cursor: 'pointer',
}

export function EmojiPicker({dataSource, onPick, onRemove, fill = false}: EmojiPickerProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const storeRef = useRef<{ incrementFavoriteEmojiCount(unicode: string): Promise<void> } | null>(null)
    const [favorites, setFavorites] = useState<Favorite[]>([])
    const [tone, setTone] = useState(0)
    const onPickRef = useRef(onPick)
    useLayoutEffect(() => {
        onPickRef.current = onPick
    })

    useEffect(() => {
        let cancelled = false
        let picker: HTMLElement | null = null
        void (async () => {
            const [{default: Database}, {default: Picker}] = await Promise.all([
                import('emoji-picker-element/database.js'),
                import('emoji-picker-element/picker.js'),
            ])
            const store = new Database({dataSource, locale: 'en'})
            // a browser that blocks storage still gets a picker, only without favorites
            await seedFavoriteEmoji(store).catch(() => undefined)
            const [stored, preferred] = await Promise.all([
                store.getTopFavoriteEmoji(COLUMNS * FAVORITE_ROWS).catch(() => [] as StoredEmoji[]),
                store.getPreferredSkinTone().catch(() => 0),
            ])
            if (cancelled) {
                // no picker shares the connection yet; once one does, its own disconnect closes it
                void store.close().catch(() => undefined)
                return
            }
            if (!hostRef.current) return
            storeRef.current = store
            setFavorites((stored as StoredEmoji[]).map(toFavorite).filter((item): item is Favorite => item != null))
            setTone(preferred)
            picker = new Picker({dataSource, locale: 'en'})
            picker.classList.add('dark')
            Object.entries(THEME).forEach(([name, value]) => picker?.style.setProperty(name, value))
            const style = document.createElement('style')
            style.textContent = HIDE_LIBRARY_FAVORITES
            picker.shadowRoot?.append(style)
            picker.addEventListener('emoji-click', (event) => {
                const detail = (event as CustomEvent<EmojiClickDetail>).detail
                const emoji = detail.unicode ?? detail.emoji.unicode
                if (!emoji) return
                // the library counted the click; one more lifts the user's pick over the starter set
                const key = detail.emoji.unicode ?? detail.emoji.name
                if (key) void store.incrementFavoriteEmojiCount(key).catch(() => undefined)
                onPickRef.current(emoji)
            })
            picker.addEventListener('skin-tone-change', (event) => {
                setTone((event as CustomEvent<{ skinTone: number }>).detail.skinTone)
            })
            hostRef.current.append(picker)
            // the search field takes the focus, as a host's own field would
            requestAnimationFrame(() => picker?.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus())
        })()
        return () => {
            cancelled = true
            picker?.remove()
            storeRef.current = null
        }
    }, [dataSource])

    const pickFavorite = (favorite: Favorite, shown: string) => {
        // the library never saw this click, so both counts of a user pick are ours
        const store = storeRef.current
        for (let count = 0; count < 2; count++) void store?.incrementFavoriteEmojiCount(favorite.key).catch(() => undefined)
        onPickRef.current(shown)
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: fill ? '100%' : WIDTH,
            maxWidth: '100%',
            height: fill ? '100%' : EMOJI_PICKER_HEIGHT - (onRemove ? 0 : REMOVE_HEIGHT),
            minHeight: 0,
        }}>
            <div role="group" aria-label="Favorites" style={{
                flex: `0 0 ${FAVORITES_HEIGHT}px`,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS}, ${CELL}px)`,
                gridAutoRows: CELL,
                alignContent: 'start',
                justifyContent: 'space-around',
                padding: '4px 0',
                boxSizing: 'border-box',
                background: 'var(--bg-panel)',
            }}>
                {favorites.map((favorite) => {
                    const shown = (tone > 0 ? favorite.skins.get(tone) : undefined) ?? favorite.key
                    return <button key={favorite.key} type="button" aria-label={favorite.label} title={favorite.label}
                                   onClick={() => pickFavorite(favorite, shown)} style={FAVORITE_BUTTON}>
                        {shown}
                    </button>
                })}
            </div>
            <div ref={hostRef} style={{
                flex: fill ? '1 1 auto' : `0 0 ${LIBRARY_HEIGHT}px`,
                // a flex item's automatic minimum is its content: the library's whole grid
                minHeight: fill ? LIBRARY_HEIGHT : 0,
                display: 'flex',
                background: 'var(--bg-panel)',
            }}/>
            {onRemove && <div style={{
                flex: `0 0 ${REMOVE_HEIGHT}px`,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
            }}>
                <Button variant="quiet" onClick={onRemove}>Remove the icon</Button>
            </div>}
        </div>
    )
}
