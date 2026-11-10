import {fireEvent, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {DEFAULT_SKY_SETTINGS, type SkySettings} from './skySettings'
import {SkySettingsPanel} from './SkySettingsPanel'

function Host({onReset = vi.fn()}: { onReset?: () => void }) {
    const [settings, setSettings] = useState<SkySettings>(DEFAULT_SKY_SETTINGS)
    return <SkySettingsPanel settings={settings} onSettings={(patch) => setSettings((now) => ({...now, ...patch}))}
                             onReset={() => {
                                 onReset()
                                 setSettings(DEFAULT_SKY_SETTINGS)
                             }}/>
}

describe('SkySettingsPanel', () => {
    it('speaks in words: a picked step shows its word and every section folds', async () => {
        render(<Host/>)

        await userEvent.click(screen.getByRole('radio', {name: 'Spacious'}))
        expect(screen.getByRole('radio', {name: 'Spacious'})).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByText('Spacious', {selector: 'strong'})).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: /Connections/}))
        expect(screen.queryByRole('radio', {name: 'Spacious'})).not.toBeInTheDocument()
    })

    it('turns the names near the pointer off at 0 and hides their reach', () => {
        render(<Host/>)
        expect(screen.getByRole('radiogroup', {name: 'Reach'})).toBeInTheDocument()

        fireEvent.change(screen.getByRole('slider', {name: 'Names near the pointer'}), {target: {value: '0'}})

        expect(screen.getByText('Off', {selector: 'strong'})).toBeInTheDocument()
        expect(screen.queryByRole('radiogroup', {name: 'Reach'})).not.toBeInTheDocument()
    })

    it('switches Mix colours and Secondary links, and Reset brings the defaults back', async () => {
        const onReset = vi.fn()
        render(<Host onReset={onReset}/>)

        const mix = screen.getByRole('switch', {name: /Mix colours/})
        expect(mix).toHaveAttribute('aria-checked', 'false')
        await userEvent.click(mix)
        expect(mix).toHaveAttribute('aria-checked', 'true')
        await userEvent.click(screen.getByRole('radio', {name: 'Solid'}))

        await userEvent.click(screen.getByRole('button', {name: 'Reset to defaults'}))

        expect(onReset).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('switch', {name: /Mix colours/})).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByRole('radio', {name: 'Dashed'})).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('status')).toHaveTextContent('Defaults restored')
    })

    it('sizes posters beside the stars while they are shown, and hides the size when posters are off', async () => {
        render(<Host/>)
        const groups = () => screen.getAllByRole('radiogroup').map((group) => group.getAttribute('aria-label'))
        const posters = screen.getByRole('switch', {name: /Posters in the sky/})
        expect(posters).toHaveAttribute('aria-checked', 'true')
        expect(groups().slice(groups().indexOf('Star size'), groups().indexOf('Star size') + 3))
            .toEqual(['Star size', 'Poster size', 'Constellation size'])

        await userEvent.click(within(screen.getByRole('radiogroup', {name: 'Poster size'})).getByRole('radio', {name: 'Beacon'}))
        expect(within(screen.getByRole('radiogroup', {name: 'Poster size'})).getByRole('radio', {name: 'Beacon'}))
            .toHaveAttribute('aria-checked', 'true')
        expect(within(screen.getByRole('radiogroup', {name: 'Star size'})).getByRole('radio', {name: 'Regular'}))
            .toHaveAttribute('aria-checked', 'true')

        await userEvent.click(posters)
        expect(posters).toHaveAttribute('aria-checked', 'false')
        expect(screen.queryByRole('radiogroup', {name: 'Poster size'})).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', {name: 'Reset to defaults'}))
        expect(screen.getByRole('switch', {name: /Posters in the sky/})).toHaveAttribute('aria-checked', 'true')
    })
})
