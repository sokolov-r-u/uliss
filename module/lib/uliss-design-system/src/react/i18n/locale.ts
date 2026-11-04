/** The interface languages Uliss ships; English is the fallback for everything else. */
export type Locale = 'en' | 'ru'

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ru']

export const DEFAULT_LOCALE: Locale = 'en'

/** A supported locale named by a language tag (`ru`, `ru-RU`, `EN-gb`); null for anything else. */
export function parseLocale(tag: unknown): Locale | null {
    if (typeof tag !== 'string') return null
    const language = tag.trim().toLowerCase().split(/[-_]/)[0]
    return (SUPPORTED_LOCALES as readonly string[]).includes(language) ? language as Locale : null
}

/**
 * The first supported language of the browser's preference list (`navigator.languages`), English when none is:
 * `['de', 'ru']` → `ru`, `['de', 'he']` → `en`.
 */
export function resolveLocale(languages: readonly string[] | undefined): Locale {
    for (const tag of languages ?? []) {
        const locale = parseLocale(tag)
        if (locale) return locale
    }
    return DEFAULT_LOCALE
}
