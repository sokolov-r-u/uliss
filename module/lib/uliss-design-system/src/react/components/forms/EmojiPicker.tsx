import {type CSSProperties, useEffect, useLayoutEffect, useRef} from 'react'
import {Button} from '../actions/Button'
import {seedFavoriteEmoji} from './emojiFavorites'

// The full Unicode emoji set with search, favorites and skin tones: a wrapper over
// `emoji-picker-element`, loaded on first open, themed with our tokens. The box keeps
// its size while the library loads. The host serves the data (`dataSource`); no CDN.
// Favorites stand above the grid, under the categories, not at the library's foot.

export interface EmojiPickerProps {
    /** URL of `emoji-picker-element-data`'s `en/emojibase/data.json`, served by the app itself. */
    dataSource: string
    /** The picked emoji with its skin tone applied. */
    onPick: (emoji: string) => void
    /** Adds a "Remove the icon" action under the picker; pass it only while there is an icon. */
    onRemove?: () => void
}

interface EmojiClickDetail {
    unicode?: string
    emoji: { unicode?: string; name?: string }
}

/** The library's own CSS variables, mapped to our tokens; square like the rest of the kit. */
const THEME = {
    width: '100%',
    flex: '1 1 auto',
    minHeight: '0',
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
    '--outline-color': 'var(--accent-2)',
    '--num-columns': '7',
    '--emoji-size': '1.375rem',
    '--skintone-border-radius': '0',
} as Record<string, string>

/** Injected into the library's shadow root (its README's way): the picker is a flex column, so `order` moves rows. */
const FAVORITES_ON_TOP = `
.favorites { order: 1; border-top: 0; border-bottom: var(--border-size) solid var(--border-color); }
.tabpanel { order: 2; }
`

export function EmojiPicker({dataSource, onPick, onRemove}: EmojiPickerProps) {
    const hostRef = useRef<HTMLDivElement>(null)
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
            // a browser that blocks storage still gets a picker, only without the starter favorites
            await seedFavoriteEmoji(store).catch(() => undefined)
            if (cancelled) {
                // no picker shares the connection yet; once one does, its own disconnect closes it
                void store.close().catch(() => undefined)
                return
            }
            if (!hostRef.current) return
            picker = new Picker({dataSource, locale: 'en'})
            picker.classList.add('dark')
            Object.entries(THEME).forEach(([name, value]) => picker?.style.setProperty(name, value))
            const style = document.createElement('style')
            style.textContent = FAVORITES_ON_TOP
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
            hostRef.current.append(picker)
            // the search field takes the focus, as a host's own field would
            requestAnimationFrame(() => picker?.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus())
        })()
        return () => {
            cancelled = true
            picker?.remove()
        }
    }, [dataSource])

    const box: CSSProperties = {display: 'flex', flexDirection: 'column', width: 320, maxWidth: '100%', height: 380}
    return (
        <div style={box}>
            <div ref={hostRef} style={{flex: 1, minHeight: 0, display: 'flex', background: 'var(--bg-panel)'}}/>
            {onRemove && <div style={{flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', paddingTop: 8}}>
                <Button variant="quiet" onClick={onRemove}>Remove the icon</Button>
            </div>}
        </div>
    )
}
