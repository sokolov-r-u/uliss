import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState} from 'react'
import {type Locale, LocaleProvider, useLocale} from '@uliss/design-system'
import {applyLocale, browserLocale, LOCALE_EVENT, type LocaleChoice, readLocaleChoice, writeLocaleChoice} from './localeChoice'

interface LocaleChoiceState {
    choice: LocaleChoice
    locale: Locale
    /** The browser's preferred supported language now; what `auto` follows. */
    browser: Locale
    setChoice: (choice: LocaleChoice) => void
}

const LocaleChoiceContext = createContext<LocaleChoiceState | null>(null)

/**
 * The app's interface language: starts from the stored choice (or the browser's language), switches the whole tree
 * without a reload when the choice changes, and follows the browser's languages while the choice is `auto`.
 */
export function AppLocaleProvider({children}: { children: ReactNode }) {
    const [choice, setChoiceState] = useState<LocaleChoice>(readLocaleChoice)
    // re-read on the browser's languagechange so `auto` follows it
    const [browserTick, setBrowserTick] = useState(0)
    // browserTick re-reads navigator.languages on the browser's languagechange
    const browser = useMemo(() => browserLocale(), [browserTick])
    const locale = choice === 'auto' ? browser : choice

    useEffect(() => {
        applyLocale(locale)
    }, [locale])

    useEffect(() => {
        const onBrowser = () => setBrowserTick((tick) => tick + 1)
        const onChoice = () => setChoiceState(readLocaleChoice())
        window.addEventListener('languagechange', onBrowser)
        window.addEventListener(LOCALE_EVENT, onChoice)
        return () => {
            window.removeEventListener('languagechange', onBrowser)
            window.removeEventListener(LOCALE_EVENT, onChoice)
        }
    }, [])

    const setChoice = useCallback((next: LocaleChoice) => {
        writeLocaleChoice(next)
        // a browser that refuses the cookie still switches until the next reload
        setChoiceState(next)
    }, [])

    const state = useMemo(() => ({choice, locale, browser, setChoice}), [choice, locale, browser, setChoice])
    return (
        <LocaleChoiceContext.Provider value={state}>
            <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </LocaleChoiceContext.Provider>
    )
}

/**
 * The language setting and its effect; only Settings › Language changes it. Outside an `AppLocaleProvider` (a screen
 * rendered alone in a test) it reads the stored choice and stores a new one without re-rendering.
 */
export function useLocaleChoice(): LocaleChoiceState {
    const state = useContext(LocaleChoiceContext)
    const locale = useLocale()
    return state ?? {choice: readLocaleChoice(), locale, browser: browserLocale(), setChoice: writeLocaleChoice}
}
