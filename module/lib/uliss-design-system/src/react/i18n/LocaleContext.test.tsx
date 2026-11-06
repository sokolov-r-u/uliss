import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import type {Dictionaries} from './dictionary'
import {LocaleProvider, useLocale, useMessages} from './LocaleContext'

const en = {title: 'Notes', count: (n: number) => `${n} notes`}
const dictionaries: Dictionaries<typeof en> = {en, ru: {title: 'Заметки', count: (n) => `${n} заметок`}}

function Probe() {
    const t = useMessages(dictionaries)
    return <p>{useLocale()} · {t.title} · {t.count(5)}</p>
}

describe('LocaleProvider', () => {
    it('renders English without a provider', () => {
        render(<Probe/>)
        expect(screen.getByText('en · Notes · 5 notes')).toBeInTheDocument()
    })

    it('switches the dictionary with the provided locale', () => {
        const {rerender} = render(<LocaleProvider locale="ru"><Probe/></LocaleProvider>)
        expect(screen.getByText('ru · Заметки · 5 заметок')).toBeInTheDocument()
        rerender(<LocaleProvider locale="en"><Probe/></LocaleProvider>)
        expect(screen.getByText('en · Notes · 5 notes')).toBeInTheDocument()
    })
})
