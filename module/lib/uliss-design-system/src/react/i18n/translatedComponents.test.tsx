import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {ChatDock} from '../components/chat/ChatDock'
import {ConstellationColorEditor} from '../components/constellation/ConstellationColorEditor'
import {ConstellationPicker, type ConstellationPickerItem} from '../components/constellation/ConstellationPicker'
import {EditorToolbar} from '../components/editor/EditorToolbar'
import {Dialog} from '../components/feedback/Dialog'
import {Notice} from '../components/feedback/Notice'
import {Select} from '../components/forms/Select'
import {LocaleProvider} from './LocaleContext'
import type {Locale} from './locale'

const inRussian = (node: ReactNode) => render(<LocaleProvider locale="ru">{node}</LocaleProvider>)

const ITEMS: ConstellationPickerItem[] = [
    {id: 'music', parentId: null, name: 'Музыка', depth: 0, path: [], color: 'red'},
]

describe('design-system components in Russian', () => {
    it('word the default actions of a dialog and a notice', () => {
        inRussian(<>
            <Dialog title="Удалить?" onConfirm={vi.fn()} onCancel={vi.fn()}/>
            <Notice title="Готово" showClose onClose={vi.fn()} onPrimary={vi.fn()}/>
        </>)
        expect(screen.getByRole('button', {name: 'Подтвердить'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Не сейчас'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Продолжить'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Закрыть'})).toBeInTheDocument()
    })

    it('keeps a label the consumer passes over the translated default', () => {
        inRussian(<Dialog title="Удалить?" confirm="Удалить" onConfirm={vi.fn()} onCancel={vi.fn()}/>)
        expect(screen.getByRole('button', {name: 'Удалить'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Подтвердить'})).toBeNull()
    })

    it('labels the chat dock and the editor toolbar', () => {
        inRussian(<>
            <ChatDock value="" onChange={vi.fn()} onMic={vi.fn()}/>
            <EditorToolbar onCommand={vi.fn()} active={{}} unavailable={{}} original={false} onOriginalChange={vi.fn()}/>
        </>)
        expect(screen.getByRole('textbox', {name: 'Сообщение'})).toHaveAttribute('placeholder', 'Запишите мысль…')
        expect(screen.getByRole('button', {name: 'Голосовой ввод'})).toBeInTheDocument()
        expect(screen.getByRole('toolbar', {name: 'Форматирование'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Маркированный список'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Оригинал'})).toBeInTheDocument()
    })

    it('names the lightness steps and the picker states', () => {
        inRussian(<>
            <ConstellationColorEditor mode="lightness" name="Джаз" rootName="Музыка" lightness="BASE" hue={30}
                                      onSave={vi.fn()} onClose={vi.fn()}/>
            <ConstellationPicker items={ITEMS} action={(name) => `В «${name}»`} onPick={vi.fn()}/>
        </>)
        expect(screen.getByRole('radio', {name: 'Глубокий'})).toBeInTheDocument()
        expect(screen.getByRole('radio', {name: 'Базовый'})).toBeChecked()
        expect(screen.getByRole('textbox', {name: 'Поиск по дереву'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Выберите созвездие'})).toBeDisabled()
    })

    it('offers to create a missing constellation in Russian', async () => {
        inRussian(<ConstellationPicker items={ITEMS} action={(name) => name} onPick={vi.fn()}
                                       onCreate={vi.fn(async () => 'new')}/>)
        await userEvent.type(screen.getByRole('textbox', {name: 'Поиск по дереву'}), 'Джаз')
        expect(screen.getByRole('button', {name: 'Создать «Джаз»'})).toBeInTheDocument()
    })

    it('re-renders in the other language when the locale changes', () => {
        const view = (locale: Locale) => <LocaleProvider locale={locale}>
            <Select label="Тема" value={null} options={[{value: 'a', label: 'A'}]} onChange={vi.fn()}/>
        </LocaleProvider>
        const {rerender} = render(view('ru'))
        expect(screen.getByText('Выберите…')).toBeInTheDocument()
        rerender(view('en'))
        expect(screen.getByText('Select…')).toBeInTheDocument()
    })
})
