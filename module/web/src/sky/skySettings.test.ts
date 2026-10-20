import {afterEach, describe, expect, it, vi} from 'vitest'
import {
    DEFAULT_SKY_SETTINGS,
    parseSkySettings,
    readSkySettings,
    SKY_SETTINGS_EVENT,
    skyPhysics,
    writeSkySettings,
} from './skySettings'

describe('sky settings', () => {
    afterEach(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    it('falls back to the defaults for anything unknown, invalid or missing', () => {
        expect(parseSkySettings(null)).toEqual(DEFAULT_SKY_SETTINGS)
        expect(parseSkySettings([1, 2])).toEqual(DEFAULT_SKY_SETTINGS)
        expect(parseSkySettings({labels: 'loud', glow: 'yes', starSize: 7, extra: true})).toEqual(DEFAULT_SKY_SETTINGS)
    })

    it('keeps every valid value and clamps the dials', () => {
        const parsed = parseSkySettings({
            labels: 'always', colour: 'mono', mixColours: true, secondaryStyle: 'solid', centerMark: 'star',
            nearReach: 'vast', labelDensity: 140, nearCount: -3,
        })
        expect(parsed).toMatchObject({
            labels: 'always', colour: 'mono', mixColours: true, secondaryStyle: 'solid', centerMark: 'star',
            nearReach: 'vast', labelDensity: 100, nearCount: 0,
        })
        expect(parseSkySettings({nearCount: 7.6, labelDensity: Number.NaN})).toMatchObject({nearCount: 8, labelDensity: 50})
    })

    it('stores the settings versioned, reads them back and tells open screens', () => {
        const heard = vi.fn()
        window.addEventListener(SKY_SETTINGS_EVENT, heard)
        const next = {...DEFAULT_SKY_SETTINGS, spread: 'vast' as const, nearCount: 3}

        writeSkySettings(next)

        expect(JSON.parse(localStorage.getItem('uliss.sky')!)).toEqual({version: 1, values: next})
        expect(readSkySettings()).toEqual(next)
        expect(heard).toHaveBeenCalledTimes(1)
        window.removeEventListener(SKY_SETTINGS_EVENT, heard)
    })

    it('survives broken storage: a corrupt value reads as defaults, a failing one keeps the last choice in memory', () => {
        // the module remembers the last write of this page, so start from the defaults
        writeSkySettings(DEFAULT_SKY_SETTINGS)
        localStorage.setItem('uliss.sky', '{not json')
        expect(readSkySettings()).toEqual(DEFAULT_SKY_SETTINGS)

        const choice = {...DEFAULT_SKY_SETTINGS, glow: false}
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota')
        })
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })
        expect(() => writeSkySettings(choice)).not.toThrow()
        expect(readSkySettings()).toEqual(choice)
    })

    it('turns words into coefficients, each step further than the last', () => {
        const at = (patch: Partial<typeof DEFAULT_SKY_SETTINGS>) => skyPhysics({...DEFAULT_SKY_SETTINGS, ...patch})
        expect(at({linkDist: 'close'}).linkDist).toBeLessThan(at({linkDist: 'spacious'}).linkDist)
        expect(at({spread: 'tight'}).repulsion).toBeGreaterThan(at({spread: 'vast'}).repulsion)
        expect(at({nearReach: 'close'}).nearRadius).toBeLessThan(at({nearReach: 'vast'}).nearRadius)
        expect(at({motion: 'calm'}).alphaDecay).toBeGreaterThan(at({motion: 'lively'}).alphaDecay)
        // more names lowers the zoom threshold
        expect(at({labelDensity: 100}).labelGain).toBeLessThan(at({labelDensity: 0}).labelGain)
        expect(at({}).nearRadius).toBe(120)
    })
})
