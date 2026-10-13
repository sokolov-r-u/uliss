import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, Route, Routes} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import {AppearanceSettings} from './AppearanceSettings'
import {SettingsPage} from './SettingsPage'

function renderSettings(path: string) {
    render(<MemoryRouter initialEntries={[path]}><Routes>
        <Route path="/settings" element={<SettingsPage/>}>
            <Route index element={<AppearanceSettings/>}/>
            <Route path="appearance" element={<AppearanceSettings/>}/>
            <Route path="account" element={<p>Account pane</p>}/>
        </Route>
    </Routes></MemoryRouter>)
}

describe('SettingsPage', () => {
    it('lists the four sections beside the open one and marks it current', () => {
        renderSettings('/settings/account')

        for (const label of ['Appearance', 'Sky', 'Account', 'Language']) {
            expect(screen.getByRole('button', {name: new RegExp(`^${label}`)})).toBeInTheDocument()
        }
        expect(screen.getByRole('button', {name: /^Account/})).toHaveAttribute('aria-current', 'page')
        expect(screen.getByText('Account pane')).toBeInTheDocument()
    })

    it('opens Appearance for the bare settings route', () => {
        renderSettings('/settings')

        expect(screen.getByRole('button', {name: /^Appearance/})).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('radiogroup', {name: 'Ground'})).toBeInTheDocument()
    })

    it('previews the live accent on a sample note in Appearance', async () => {
        renderSettings('/settings/appearance')

        expect(screen.getByText('Open note')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('radio', {name: /Patina/}))
        expect(screen.getByRole('button', {name: /^Appearance/})).toHaveTextContent('Patina')
    })
})
