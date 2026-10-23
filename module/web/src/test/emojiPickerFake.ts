// jsdom has no IndexedDB and draws no shadow DOM, so web tests swap emoji-picker-element for these fakes:
// a store with two favorites and a picker element whose one button picks 👍🏽.
//   vi.mock('emoji-picker-element/database.js', () => import('../test/emojiPickerFake').then((m) => m.databaseModule))
//   vi.mock('emoji-picker-element/picker.js', () => import('../test/emojiPickerFake').then((m) => m.pickerModule()))

const FAVORITES = [
    {unicode: '🎷', annotation: 'saxophone'},
    {unicode: '🎸', annotation: 'guitar'},
]

export const databaseModule = {
    default: class {
        async ready() {
        }

        async close() {
        }

        async getTopFavoriteEmoji(limit: number) {
            return FAVORITES.slice(0, limit)
        }

        async getPreferredSkinTone() {
            return 0
        }

        async incrementFavoriteEmojiCount() {
        }
    },
}

export function pickerModule() {
    class FakePicker extends HTMLElement {
        constructor() {
            super()
            this.attachShadow({mode: 'open'})
        }

        connectedCallback() {
            const pick = document.createElement('button')
            pick.textContent = 'thumbs up, medium skin tone'
            pick.addEventListener('click', () => this.dispatchEvent(new CustomEvent('emoji-click', {
                detail: {unicode: '👍🏽', emoji: {unicode: '👍'}},
            })))
            this.append(pick)
        }
    }

    if (!customElements.get('emoji-picker')) customElements.define('emoji-picker', FakePicker)
    return {default: FakePicker}
}
