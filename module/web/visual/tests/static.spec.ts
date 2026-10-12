import {expect, test} from '@playwright/test'
import {readFileSync, readdirSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

const sourceRoot = resolve(import.meta.dirname, '../../src')

function files(path: string): string[] {
    return readdirSync(path).flatMap((entry) => {
        const child = resolve(path, entry)
        return statSync(child).isDirectory() ? files(child) : /\.(tsx?|css)$/.test(entry) ? [child] : []
    })
}

const sources = files(sourceRoot).map((path) => ({path, text: readFileSync(path, 'utf8')}))

test('runtime does not import visual fixtures', () => {
    expect(sources.filter(({text}) => /from\s+['"][^'"]*(?:visual|fixtures)/.test(text)).map(({path}) => path)).toEqual([])
})

// Recency group headings in the side panel (Today / Yesterday …) are the kit's section labels, not row dates.
const RELATIVE_DATE_HEADINGS = /ui\/nav\/recency\.ts$/

test('product copy has no emoji or relative dates', () => {
    const violations = sources.filter(({path, text}) => !RELATIVE_DATE_HEADINGS.test(path)
        && (/\p{Extended_Pictographic}/u.test(text) || /["'`](?:Yesterday|Today|Tomorrow|[^"'`]*\bago\b|[^"'`]*last night)/i.test(text)))
    expect(violations.map(({path}) => path)).toEqual([])
})

test('React click handlers are not attached to div or span', () => {
    const violations = sources.filter(({text}) => /<(?:div|span)\b[^>]*\bonClick=/s.test(text))
    expect(violations.map(({path}) => path)).toEqual([])
})

test('raw colours stay in the documented appearance-value adapter', () => {
    const violations = sources.filter(({
                                           path,
                                           text
                                       }) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith('AppearanceSettings.tsx') && /(?:#[0-9a-f]{3,8}\b|rgba?\()/i.test(text))
    expect(violations.map(({path}) => path)).toEqual([])
})
