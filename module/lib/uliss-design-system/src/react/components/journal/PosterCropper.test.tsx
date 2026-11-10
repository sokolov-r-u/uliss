import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {PosterCropper, type PosterCropperProps} from './PosterCropper'
import {type CropMode, defaultCrop, type PosterCrop} from './posterCrop'

const W = 1000
const H = 600

function Harness({initial = defaultCrop(W, H), onChange = vi.fn(), ...props}: Partial<PosterCropperProps> & {
    initial?: PosterCrop
}) {
    const [mode, setMode] = useState<CropMode>('poster')
    const [value, setValue] = useState(initial)
    return <PosterCropper src="https://example.com/p.jpg" imageWidth={W} imageHeight={H} mode={mode}
                          onModeChange={setMode} value={value}
                          onChange={(next) => {
                              setValue(next)
                              onChange(next)
                          }} {...props}/>
}

const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.lastCall![0] as PosterCrop

describe('PosterCropper', () => {
    it('moves the active frame with the arrow keys and zooms it with plus and minus', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<Harness onChange={onChange}/>)
        const stage = screen.getByRole('group', {name: /Panel frame 2:3/})

        stage.focus()
        await user.keyboard('{ArrowRight}')
        // the image moves left, so the frame moves right over it
        expect(last(onChange).poster.x).toBeGreaterThan(0.3)
        expect(last(onChange).poster.y).toBe(0)
        expect(last(onChange).avatar).toEqual(defaultCrop(W, H).avatar)

        await user.keyboard('+')
        expect(last(onChange).poster.w).toBeLessThan(0.4)
        expect(screen.getByText('115%')).toBeInTheDocument()
        await user.keyboard('-')
        expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('zooms with the buttons only within the limits and resets the active frame', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<Harness onChange={onChange}/>)
        const zoomOut = screen.getByRole('button', {name: 'Zoom out'})
        const zoomIn = screen.getByRole('button', {name: 'Zoom in'})

        expect(zoomOut).toBeDisabled()
        // 400 px wide at 100%; 150 px is the floor (within half a pixel), so ×1.15 stops after seven steps
        for (let i = 0; i < 10; i++) await user.click(zoomIn)
        expect(zoomIn).toBeDisabled()
        expect(onChange).toHaveBeenCalledTimes(7)
        expect(last(onChange).poster.w).toBeGreaterThanOrEqual(0.15)
        expect(last(onChange).poster.w).toBeLessThan(0.1505)
        expect(screen.getByText('266%')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Reset'}))
        expect(last(onChange)).toEqual(defaultCrop(W, H))
        expect(zoomOut).toBeDisabled()
    })

    it('edits only the frame of the chosen mode', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<Harness onChange={onChange}/>)

        await user.click(screen.getByRole('radio', {name: 'Sky avatar'}))
        const stage = screen.getByRole('group', {name: /Sky avatar/})
        expect(screen.getByRole('radio', {name: 'Sky avatar'})).toHaveAttribute('aria-checked', 'true')
        await user.click(screen.getByRole('button', {name: 'Zoom in'}))

        expect(last(onChange).poster).toEqual(defaultCrop(W, H).poster)
        expect(last(onChange).avatar.w).toBeLessThan(0.6)
        expect(stage).toBeInTheDocument()
    })

    it('changes nothing while loading, unavailable or disabled', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        const {rerender} = render(<Harness onChange={onChange} status="loading"/>)
        expect(screen.getByText('Loading the image…')).toBeInTheDocument()

        rerender(<Harness onChange={onChange} status="unavailable"/>)
        expect(screen.getByText('Image unavailable')).toBeInTheDocument()
        expect(screen.queryByRole('img', {name: 'Poster preview'})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Reset'})).toBeDisabled()

        rerender(<Harness onChange={onChange} disabled/>)
        const stage = screen.getByRole('group', {name: /Panel frame 2:3/})
        stage.focus()
        await user.keyboard('{ArrowRight}+')
        expect(screen.getByRole('button', {name: 'Zoom in'})).toBeDisabled()
        expect(onChange).not.toHaveBeenCalled()
    })
})
