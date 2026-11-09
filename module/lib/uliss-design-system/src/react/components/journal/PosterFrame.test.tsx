import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {PosterFrame} from './PosterFrame'

describe('PosterFrame', () => {
    it('loads the image without telling its host where it is shown, and reports a failure', () => {
        const onImageError = vi.fn()
        render(<PosterFrame state="image" src="https://example.com/p.jpg" alt="Dune poster"
                            onImageError={onImageError}/>)
        const image = screen.getByRole('img', {name: 'Dune poster'})

        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
        fireEvent.error(image)
        expect(onImageError).toHaveBeenCalledOnce()
    })

    it('names an unavailable poster’s host and a small one’s real size', () => {
        const {rerender} = render(<PosterFrame state="unavailable" src="https://example.com/p.jpg"
                                               host="images.example.com"/>)
        expect(screen.getByText('Image unavailable')).toBeInTheDocument()
        expect(screen.getByText('images.example.com')).toBeInTheDocument()
        expect(screen.queryByRole('img')).not.toBeInTheDocument()

        rerender(<PosterFrame state="small" src="https://example.com/p.jpg" alt="Thumb" badge="120 × 180"/>)
        expect(screen.getByRole('img', {name: 'Thumb'})).toBeInTheDocument()
        expect(screen.getByText('120 × 180')).toBeInTheDocument()
    })
})
