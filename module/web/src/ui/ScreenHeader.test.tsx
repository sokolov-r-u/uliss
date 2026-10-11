import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import {ScreenHeader, ShellNavContext} from './ScreenHeader'

describe('ScreenHeader', () => {
    it('shows a list kicker with its count and right-hand action', () => {
        render(<ScreenHeader kicker="Notes" count={12} right={<button type="button">New</button>}/>)

        expect(screen.getByText('Notes')).toBeInTheDocument()
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'New'})).toBeInTheDocument()
        expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('shows a detail title as the page heading with a meta line', () => {
        render(<ScreenHeader title="Lisbon trip" meta="2 notes"/>)

        expect(screen.getByRole('heading', {level: 1, name: 'Lisbon trip'})).toBeInTheDocument()
        expect(screen.getByText('2 notes')).toBeInTheDocument()
    })

    it('opens the shell navigation from its menu button', async () => {
        const openNav = vi.fn()
        render(<ShellNavContext.Provider value={openNav}><ScreenHeader kicker="Chats"/></ShellNavContext.Provider>)

        await userEvent.click(screen.getByRole('button', {name: 'Open navigation'}))

        expect(openNav).toHaveBeenCalledOnce()
    })
})
