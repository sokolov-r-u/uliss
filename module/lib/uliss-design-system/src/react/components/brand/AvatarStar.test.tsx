import {render} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {AVATAR_RADIUS, AvatarStar} from './AvatarStar'

const SRC = 'https://images.example.com/dune.jpg'

const draw = (ui: React.ReactNode) => render(<svg>{ui}</svg>).container

describe('AvatarStar', () => {
    it('clips the poster to a circle of its radius and rings it in its colour', () => {
        const svg = draw(<AvatarStar x={50} y={40} r={AVATAR_RADIUS.bold} src={SRC} color="gold"/>)
        const image = svg.querySelector('image')!
        const clip = svg.querySelector('clipPath')!

        expect(image.getAttribute('href')).toBe(SRC)
        expect(image.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice')
        expect(image.getAttribute('clip-path')).toBe(`url(#${clip.id})`)
        expect(clip.querySelector('circle')!.getAttribute('r')).toBe('12')
        const ring = [...svg.querySelectorAll('circle')].find((c) => c.getAttribute('stroke') === 'gold')!
        expect(ring.getAttribute('r')).toBe('12')
        expect(ring.getAttribute('fill')).toBe('none')
    })

    it('shows the avatar frame of the image, or its centre without one', () => {
        const framed = draw(<AvatarStar x={50} y={40} r={10} src={SRC} color="gold"
                                        crop={{x: 0.25, y: 0.5, w: 0.5, h: 0.25}}/>).querySelector('image')!
        expect([framed.getAttribute('x'), framed.getAttribute('y'), framed.getAttribute('width'),
            framed.getAttribute('height')]).toEqual(['30', '-10', '40', '80'])

        const centred = draw(<AvatarStar x={50} y={40} r={10} src={SRC} color="gold"/>).querySelector('image')!
        expect([centred.getAttribute('x'), centred.getAttribute('width')]).toEqual(['40', '20'])
    })

    it('adds a halo of 1.6 radii only with glow', () => {
        const halo = (svg: Element) => [...svg.querySelectorAll('circle')].find((c) => c.getAttribute('opacity') === '0.14')
        expect(halo(draw(<AvatarStar x={0} y={0} r={10} src={SRC} color="gold"/>))).toBeUndefined()
        expect(halo(draw(<AvatarStar x={0} y={0} r={10} src={SRC} color="gold" glow/>))!.getAttribute('r')).toBe('16')
    })

    it('gives every avatar its own clip, so two avatars never share one circle', () => {
        const svg = draw(<>
            <AvatarStar x={10} y={10} r={10} src={SRC} color="gold"/>
            <AvatarStar x={60} y={10} r={10} src={SRC} color="gold"/>
        </>)
        const ids = [...svg.querySelectorAll('clipPath')].map((clip) => clip.id)
        expect(new Set(ids).size).toBe(2)
        ids.forEach((id) => expect(id).toMatch(/^[a-zA-Z0-9_-]+$/))
    })
})
