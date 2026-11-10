import {renderHook} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {DEFAULT_SKY_SETTINGS} from './skySettings'
import {useSkyPhysics} from './useSkySettings'

describe('useSkyPhysics', () => {
    it('keeps the same physics while only the look of the marks changes, so the sky does not move', () => {
        const {result, rerender} = renderHook(({settings}) => useSkyPhysics(settings),
            {initialProps: {settings: DEFAULT_SKY_SETTINGS}})
        const first = result.current

        rerender({settings: {...DEFAULT_SKY_SETTINGS, posters: false, posterSize: 'beacon', glow: false, colour: 'mono'}})
        expect(result.current).toBe(first)

        rerender({settings: {...DEFAULT_SKY_SETTINGS, spread: 'vast'}})
        expect(result.current).not.toBe(first)
        expect(result.current.repulsion).not.toBe(first.repulsion)
    })
})
