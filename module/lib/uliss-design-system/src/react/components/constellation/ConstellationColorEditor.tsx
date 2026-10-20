import {useEffect, useState} from 'react'
import {arrowFocus} from '../../hooks/arrowFocus'
import {Button} from '../actions/Button'
import {IconButton} from '../actions/IconButton'
import {Kicker} from '../brand/Kicker'
import {Icon} from '../icons/Icon'
import {TagDot} from './TagDot'
import {
    CONSTELLATION_LIGHTNESS_STEPS,
    CONSTELLATION_PALETTE,
    type ConstellationLightness,
    constellationColor,
} from './constellationColor'

// Colour of one branch. A root owns its hue: the 13-tone palette first, a hue
// slider for the fussy. A sub-constellation has no hue of its own — it inherits
// the root's and picks one of four lightness steps.

interface EditorBase {
    /** The branch being coloured, shown in the preview chip. */
    name: string
    onClose: () => void
    /** Greys Save while the change is being stored. */
    busy?: boolean
}

export type ConstellationColorEditorProps = EditorBase & (
    | { mode: 'hue'; hue: number; onSave: (hue: number) => void }
    | {
    mode: 'lightness'
    /** The root's hue, inherited. */
    hue: number
    lightness: ConstellationLightness
    rootName: string
    onSave: (lightness: ConstellationLightness) => void
})

const CAPTION = {
    fontFamily: 'var(--font-text)',
    fontSize: 8.5,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
} as const

export function ConstellationColorEditor(props: ConstellationColorEditorProps) {
    const [hue, setHue] = useState(props.hue)
    const initialLightness: ConstellationLightness = props.mode === 'lightness' ? props.lightness : 'BASE'
    const [lightness, setLightness] = useState<ConstellationLightness>(initialLightness)
    // another branch shown in the same editor starts from its own colour, not the previous draft
    useEffect(() => setHue(props.hue), [props.hue])
    useEffect(() => setLightness(initialLightness), [initialLightness])
    const paletteIndex = CONSTELLATION_PALETTE.indexOf(hue as (typeof CONSTELLATION_PALETTE)[number])
    const lightnessIndex = CONSTELLATION_LIGHTNESS_STEPS.findIndex((step) => step.id === lightness)
    const color = constellationColor(hue, lightness)
    const changed = props.mode === 'hue' ? hue !== props.hue : lightness !== props.lightness
    const save = () => {
        if (props.mode === 'hue') props.onSave(hue)
        else props.onSave(lightness)
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '14px 16px',
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            background: 'var(--bg-surface)',
        }}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <Kicker size={9} spacing="2.5px" color="var(--text-faint)">Colour</Kicker>
                <IconButton s={30} title="Close colour" onClick={props.onClose}><Icon name="close" size={13}/></IconButton>
            </div>
            {props.mode === 'hue' ? <>
                <div role="radiogroup" aria-label="Palette"
                     style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7}}>
                    {CONSTELLATION_PALETTE.map((tone, index) => (
                        // one tab stop (the chosen tone, or the first when the slider set another hue); arrows move
                        <button key={tone} type="button" role="radio" aria-checked={hue === tone}
                                tabIndex={index === Math.max(paletteIndex, 0) ? 0 : -1}
                                aria-label={`Hue ${tone}`} title={`Hue ${tone}`} onClick={() => setHue(tone)}
                                onKeyDown={(event) => {
                                    const next = arrowFocus(event, event.currentTarget.parentElement, index, CONSTELLATION_PALETTE.length, 7)
                                    if (next !== null) setHue(CONSTELLATION_PALETTE[next])
                                }}
                                style={{
                                    height: 26,
                                    padding: 0,
                                    border: 0,
                                    background: constellationColor(tone),
                                    // the choice is a ring drawn with a shadow: the outline stays free for the focus ring
                                    boxShadow: hue === tone ? '0 0 0 2px var(--bg-surface), 0 0 0 3px var(--cream)' : 'none',
                                    cursor: 'pointer',
                                }}/>
                    ))}
                </div>
                <label style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                    <span style={{...CAPTION, fontSize: 9, letterSpacing: '2px', color: 'var(--text-faint)'}}>Or shift the hue</span>
                    <input type="range" min={0} max={359} value={hue} aria-label="Hue"
                           onChange={(event) => setHue(Number(event.target.value))}
                           style={{width: '100%', accentColor: color}}/>
                </label>
            </> : <>
                <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
                    <TagDot color={constellationColor(hue)} size={8}/>
                    <span style={{fontFamily: 'var(--font-text)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-faint)'}}>
                        Inherits from <span style={{color: 'var(--cream-dim)'}}>{props.rootName}</span>
                    </span>
                </div>
                <div role="radiogroup" aria-label="Lightness" style={{display: 'flex', gap: 7}}>
                    {CONSTELLATION_LIGHTNESS_STEPS.map((step, index) => {
                        const on = step.id === lightness
                        return (
                            <button key={step.id} type="button" role="radio" aria-checked={on}
                                    tabIndex={index === Math.max(lightnessIndex, 0) ? 0 : -1}
                                    onClick={() => setLightness(step.id)}
                                    onKeyDown={(event) => {
                                        const next = arrowFocus(event, event.currentTarget.parentElement, index, CONSTELLATION_LIGHTNESS_STEPS.length)
                                        if (next !== null) setLightness(CONSTELLATION_LIGHTNESS_STEPS[next].id)
                                    }}
                                    style={{
                                        flex: 1,
                                        minHeight: 44,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 6,
                                        padding: 0,
                                        border: 0,
                                        background: 'transparent',
                                        cursor: 'pointer',
                                    }}>
                                <span style={{
                                    width: '100%',
                                    height: 22,
                                    background: constellationColor(hue, step.id),
                                    outline: on ? '1px solid var(--cream)' : '1px solid transparent',
                                    outlineOffset: 2,
                                }}/>
                                <span style={{...CAPTION, color: on ? 'var(--cream)' : 'var(--text-faint)'}}>{step.label}</span>
                            </button>
                        )
                    })}
                </div>
            </>}
            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    minWidth: 0,
                    padding: '6px 9px',
                    border: '1px solid var(--line-strong)',
                    fontFamily: 'var(--font-text)',
                    fontSize: 10.5,
                    letterSpacing: '1.6px',
                    textTransform: 'uppercase',
                    color: 'var(--cream)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                }}><TagDot color={color}/>{props.name}</span>
                <Button size="lg" style={{marginLeft: 'auto'}} disabled={!changed || props.busy} aria-busy={props.busy || undefined}
                        onClick={save}>{props.busy ? 'Saving…' : 'Save'}</Button>
            </div>
        </div>
    )
}
