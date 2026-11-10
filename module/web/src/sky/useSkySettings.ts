import {useCallback, useEffect, useMemo, useState} from 'react'
import {readSkySettings, SKY_SETTINGS_EVENT, type SkyPhysics, type SkySettings, skyPhysics, writeSkySettings} from './skySettings'

/** The device's sky settings, shared live between the open sky, its settings sheet and Settings › Sky. */
export function useSkySettings(): [SkySettings, (patch: Partial<SkySettings>) => void, (next: SkySettings) => void] {
    const [settings, setSettings] = useState(readSkySettings)
    useEffect(() => {
        const sync = () => setSettings(readSkySettings())
        window.addEventListener(SKY_SETTINGS_EVENT, sync)
        return () => window.removeEventListener(SKY_SETTINGS_EVENT, sync)
    }, [])
    const replace = useCallback((next: SkySettings) => writeSkySettings(next), [])
    const patch = useCallback((change: Partial<SkySettings>) => writeSkySettings({...readSkySettings(), ...change}), [])
    return [settings, patch, replace]
}

/**
 * The renderer's coefficients for [settings], kept the same object while its numbers stay the same: a new one
 * re-heats the layout, so a setting that only changes how marks look (glow, colour, posters) must not move the sky.
 */
export function useSkyPhysics(settings: SkySettings): SkyPhysics {
    const key = JSON.stringify(skyPhysics(settings))
    return useMemo(() => JSON.parse(key) as SkyPhysics, [key])
}
