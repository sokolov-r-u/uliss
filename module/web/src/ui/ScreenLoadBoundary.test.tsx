import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {lazy} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ScreenLoadBoundary} from './ScreenLoadBoundary'

describe('ScreenLoadBoundary', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('shows the screen once its code arrives', async () => {
        const Screen = lazy(async () => ({default: () => <h1>Sky</h1>}))
        render(<ScreenLoadBoundary><Screen/></ScreenLoadBoundary>)

        expect(screen.getByText('Loading…')).toBeInTheDocument()
        expect(await screen.findByRole('heading', {name: 'Sky'})).toBeInTheDocument()
    })

    it('offers a reload instead of a blank app when the code is gone after a deploy', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const reload = vi.fn()
        vi.stubGlobal('location', {...window.location, reload})
        const Screen = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
        render(<ScreenLoadBoundary><Screen/></ScreenLoadBoundary>)

        await userEvent.click(await screen.findByRole('button', {name: 'Reload'}))
        expect(screen.getByText('This screen could not load')).toBeInTheDocument()
        expect(reload).toHaveBeenCalledOnce()
    })
})
