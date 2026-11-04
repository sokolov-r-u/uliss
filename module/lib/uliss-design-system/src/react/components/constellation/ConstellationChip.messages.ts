import type {Dictionaries} from '../../i18n/dictionary'

const en = {
    remove: (name: string) => `Remove ${name}`,
}

export const constellationChipMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        remove: (name) => `Убрать ${name}`,
    },
}
