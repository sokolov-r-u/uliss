import type {Locale} from './locale'

/**
 * The word forms of a counted noun. English needs `one` and `other`; Russian also `few` (2–4, 22–24…) and `many`
 * (5–20, 25–30…, 11–14); `other` is Russian's form for fractions.
 */
export interface PluralForms {
    one: string
    few?: string
    many?: string
    other: string
}

const rules = new Map<Locale, Intl.PluralRules>()

function rulesFor(locale: Locale): Intl.PluralRules {
    let found = rules.get(locale)
    if (!found) {
        found = new Intl.PluralRules(locale)
        rules.set(locale, found)
    }
    return found
}

/** The form of `forms` the locale's plural rules pick for `count`; a missing form falls back to `other`. */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
    const category = rulesFor(locale).select(count)
    if (category === 'one') return forms.one
    if (category === 'few') return forms.few ?? forms.other
    if (category === 'many') return forms.many ?? forms.other
    return forms.other
}
