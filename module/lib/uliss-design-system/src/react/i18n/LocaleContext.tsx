import {createContext, type ReactNode, useContext} from 'react'
import type {Dictionaries, Message, Translation} from './dictionary'
import {DEFAULT_LOCALE, type Locale} from './locale'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export interface LocaleProviderProps {
    locale: Locale
    children?: ReactNode
}

/** Sets the interface language for everything below it; without a provider components render in English. */
export function LocaleProvider({locale, children}: LocaleProviderProps) {
    return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** The active interface language. */
export function useLocale(): Locale {
    return useContext(LocaleContext)
}

/** The active language's dictionary of `dictionaries`; a component re-renders with the other one on a switch. */
export function useMessages<Source extends Record<string, Message>>(
    dictionaries: Dictionaries<Source>,
): Translation<Source> {
    return dictionaries[useLocale()]
}
