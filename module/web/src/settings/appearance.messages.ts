import type {Dictionaries} from '@uliss/design-system'

/** Settings › Appearance and its summary in the Settings rows. */
const en = {
    kicker: 'Appearance',
    ground: 'Ground',
    obsidian: 'Obsidian',
    obsidianNote: 'Neutral black grounds',
    void: 'Deep void',
    voidNote: 'Cool blue-black grounds',
    accent: 'Accent',
    ochre: 'Ochre',
    terracotta: 'Terracotta',
    patina: 'Patina',
    bone: 'Bone',
    textSize: 'Text size',
    compact: 'Compact',
    regular: 'Regular',
    large: 'Large',
    larger: 'Larger',
    sample: 'A recurring thread in your notes — constraints make you more creative, not less. Link it under '
        + '“Creative constraint”?',
    preview: 'Preview',
    previewKicker: 'Note 142',
    previewText: 'Constraints make me more creative, not less.',
    previewAction: 'Open note',
    footNote: 'Applies everywhere except sign in · remembered on this device',
    hint: (ground: string, accent: string, read: string) => `${ground} · ${accent} · ${read} text`,
}

export const appearanceMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        kicker: 'Оформление',
        ground: 'Фон',
        obsidian: 'Обсидиан',
        obsidianNote: 'Нейтральный чёрный фон',
        void: 'Глубокая пустота',
        voidNote: 'Холодный сине-чёрный фон',
        accent: 'Акцент',
        ochre: 'Охра',
        terracotta: 'Терракота',
        patina: 'Патина',
        bone: 'Кость',
        textSize: 'Размер текста',
        compact: 'Компактный',
        regular: 'Обычный',
        large: 'Крупный',
        larger: 'Очень крупный',
        sample: 'Повторяющаяся мысль в ваших заметках — ограничения делают вас изобретательнее, а не наоборот. '
            + 'Связать её с «Творческим ограничением»?',
        preview: 'Предпросмотр',
        previewKicker: 'Заметка 142',
        previewText: 'Ограничения делают меня изобретательнее, а не наоборот.',
        previewAction: 'Открыть заметку',
        footNote: 'Действует везде, кроме входа · запоминается на этом устройстве',
        hint: (ground, accent, read) => `${ground} · ${accent} · ${read.toLowerCase()} текст`,
    },
}
