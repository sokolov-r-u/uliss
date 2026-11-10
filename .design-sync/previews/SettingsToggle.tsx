import {SettingsToggle} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const States = () => {
    const [posters, setPosters] = useState(true)
    const [mix, setMix] = useState(false)
    return (
        <Ground width={360}>
            <SettingsToggle label="Posters in the sky" hint="Notes with a poster show it instead of their star"
                            on={posters} onChange={setPosters}/>
            <SettingsToggle label="Mix colours" hint="A star in several constellations shows each colour"
                            on={mix} onChange={setMix} divider/>
        </Ground>
    )
}
