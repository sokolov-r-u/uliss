import {type Locale, readLocaleCookie, resolveLocale, writeLocaleCookie} from '@uliss/design-system'

/**
 * The language setting (Settings › Language): an explicit locale, or `auto` — follow the browser. The explicit choice
 * lives in the `uliss_lang` cookie shared with the auth pages; `auto` is the absence of that cookie.
 */
export type LocaleChoice = Locale | 'auto'

/** Fired on `window` after `writeLocaleChoice`, so other mounted parts (the Settings rows) re-read the choice. */
export const LOCALE_EVENT = 'uliss:locale'

export function readLocaleChoice(): LocaleChoice {
    try {
        return readLocaleCookie(document.cookie) ?? 'auto'
    } catch {
        return 'auto'
    }
}

/** The browser's preferred supported language, English when it prefers none of ours. */
export function browserLocale(): Locale {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
    return resolveLocale(languages)
}

export function effectiveLocale(choice: LocaleChoice): Locale {
    return choice === 'auto' ? browserLocale() : choice
}

/** `<html lang>` follows the interface language (screen readers, hyphenation, `:lang()` rules). */
export function applyLocale(locale: Locale): void {
    document.documentElement.lang = locale
}

export function writeLocaleChoice(choice: LocaleChoice): void {
    writeLocaleCookie(choice === 'auto' ? null : choice)
    window.dispatchEvent(new Event(LOCALE_EVENT))
}
