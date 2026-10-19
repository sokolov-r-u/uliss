import {useCallback, useEffect, useState} from 'react'
import {readSkySettings, SKY_SETTINGS_EVENT, type SkySettings, writeSkySettings} from './skySettings'

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
