import {type ReactNode, useEffect, useRef, useState} from 'react'
import {Kicker, StepControl} from '@uliss/design-system'
import type {SkySettings} from './skySettings'
import './sky.css'

type Steps<K extends keyof SkySettings> = { id: SkySettings[K] & string; label: string }[]

const LABELS: Steps<'labels'> = [{id: 'always', label: 'Always'}, {id: 'auto', label: 'Auto'}, {id: 'off', label: 'Off'}]
const LABEL_SIZE: Steps<'labelSize'> = [
    {id: 'small', label: 'Small'}, {id: 'regular', label: 'Regular'}, {id: 'large', label: 'Large'},
    {id: 'largest', label: 'Largest'},
]
const MARK_SIZE: Steps<'starSize'> = [
    {id: 'fine', label: 'Fine'}, {id: 'regular', label: 'Regular'}, {id: 'bold', label: 'Bold'},
    {id: 'beacon', label: 'Beacon'},
]
const COLOUR: Steps<'colour'> = [{id: 'constellation', label: 'By constellation'}, {id: 'mono', label: 'Monochrome'}]
const CENTER: Steps<'centerMark'> = [{id: 'ship', label: 'Ship'}, {id: 'star', label: 'Star'}]
const LINK_DIST: Steps<'linkDist'> = [
    {id: 'close', label: 'Close'}, {id: 'comfortable', label: 'Comfortable'}, {id: 'roomy', label: 'Roomy'},
    {id: 'spacious', label: 'Spacious'},
]
const TENSION: Steps<'tension'> = [
    {id: 'slack', label: 'Slack'}, {id: 'balanced', label: 'Balanced'}, {id: 'taut', label: 'Taut'},
    {id: 'rigid', label: 'Rigid'},
]
const SECONDARY: Steps<'secondary'> = [
    {id: 'faint', label: 'Faint'}, {id: 'gentle', label: 'Gentle'}, {id: 'firm', label: 'Firm'},
    {id: 'strong', label: 'Strong'},
]
const SECONDARY_STYLE: Steps<'secondaryStyle'> = [{id: 'dashed', label: 'Dashed'}, {id: 'solid', label: 'Solid'}]
const SPREAD: Steps<'spread'> = [
    {id: 'tight', label: 'Tight'}, {id: 'balanced', label: 'Balanced'}, {id: 'open', label: 'Open'},
    {id: 'vast', label: 'Vast'},
]
const PULL: Steps<'pull'> = [
    {id: 'loose', label: 'Loose'}, {id: 'gentle', label: 'Gentle'}, {id: 'firm', label: 'Firm'},
    {id: 'tight', label: 'Tight'},
]
const MOTION: Steps<'motion'> = [{id: 'calm', label: 'Calm'}, {id: 'natural', label: 'Natural'}, {id: 'lively', label: 'Lively'}]

type SectionId = 'labels' | 'stars' | 'center' | 'connections' | 'room' | 'movement'

/**
 * The one Sky settings surface, in two shells: Settings › Sky and the sheet over the sky. Every choice is a word;
 * sections fold, all open at first. Changes apply to the sky as they are made and are remembered on this device.
 */
export function SkySettingsPanel({settings, onSettings, onReset}: {
    settings: SkySettings
    onSettings: (patch: Partial<SkySettings>) => void
    onReset: () => void
}) {
    const [closed, setClosed] = useState<ReadonlySet<SectionId>>(new Set())
    const [flash, setFlash] = useState(false)
    const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(flashTimer.current), [])

    const section = (id: SectionId, label: string, children: ReactNode) => {
        const open = !closed.has(id)
        return <section className="sky-settings-section">
            <button type="button" className="sky-settings-fold" aria-expanded={open} onClick={() => setClosed((now) => {
                const next = new Set(now)
                if (open) next.add(id)
                else next.delete(id)
                return next
            })}>
                <Kicker size={8.5} spacing="3px" color="var(--text-muted)">{label}</Kicker>
                <span className="settings-section-rule"/>
                <span className={open ? 'sky-settings-chevron open' : 'sky-settings-chevron'} aria-hidden>›</span>
            </button>
            {open && <div className="sky-settings-rows">{children}</div>}
        </section>
    }

    const steps = <K extends keyof SkySettings>(key: K, label: string, options: Steps<K>, hint?: string) =>
        <Row label={label} hint={hint} value={options.find((o) => o.id === settings[key])?.label}>
            <StepControl label={label} value={settings[key] as string} steps={options}
                         onPick={(id) => onSettings({[key]: id} as Partial<SkySettings>)}/>
        </Row>

    const toggle = (key: 'mixColours' | 'glow' | 'midStars', label: string, hint: string) =>
        <button type="button" role="switch" aria-checked={settings[key]} className="sky-settings-toggle"
                onClick={() => onSettings({[key]: !settings[key]})}>
            <span className="sky-settings-toggle-text"><span>{label}</span><small>{hint}</small></span>
            <span className={settings[key] ? 'sky-settings-switch on' : 'sky-settings-switch'} aria-hidden><i/></span>
        </button>

    return <div className="sky-settings">
        {section('labels', 'Labels', <>
            {steps('labels', 'Show note names', LABELS, 'Auto keeps names hidden until there is room — zoom in and they appear.')}
            {settings.labels === 'auto' && <Row label="How many names"
                                                hint="Left keeps the sky clean, right fits in as many names as it can.">
                <input type="range" className="sky-settings-range" aria-label="How many names" min={0} max={100}
                       step={5} value={settings.labelDensity}
                       onChange={(event) => onSettings({labelDensity: Number(event.target.value)})}/>
                <span className="sky-settings-ends"><span>Fewer</span><span>More</span></span>
            </Row>}
            {steps('labelSize', 'Text size', LABEL_SIZE)}
        </>)}
        {section('stars', 'Stars', <>
            {steps('starSize', 'Star size', MARK_SIZE)}
            {steps('constellationSize', 'Constellation size', MARK_SIZE,
                'How large the constellation rings read against the stars they hold.')}
            {steps('colour', 'Colour', COLOUR,
                'By constellation tints each star with its constellation. Monochrome is the plain night sky.')}
            {toggle('mixColours', 'Mix colours', 'A star in several constellations shows all of their colours.')}
            {toggle('glow', 'Glow', 'Soft halo around each star.')}
        </>)}
        {section('center', 'Center', steps('centerMark', 'Starting point', CENTER,
            'The point every note radiates from — a ship by default, charting the way.'))}
        {section('connections', 'Connections', <>
            {steps('linkDist', 'Distance between notes', LINK_DIST)}
            {steps('tension', 'Line tension', TENSION, 'How firmly a note is held by the ones it links to.')}
            {steps('secondary', 'Pull of secondary links', SECONDARY,
                'How strongly a note is drawn to the other constellations it belongs to, beside its own.')}
            {steps('secondaryStyle', 'Secondary links', SECONDARY_STYLE,
                'How the lines to a note’s other constellations are drawn.')}
            {toggle('midStars', 'Midpoint sparks', 'A faint point where two notes meet.')}
        </>)}
        {section('room', 'Room', <>
            {steps('spread', 'Breathing room', SPREAD, 'How strongly stars push each other apart.')}
            {steps('pull', 'Pull to centre', PULL, 'Higher gathers everything around the centre; lower lets it drift out.')}
        </>)}
        {section('movement', 'Movement', steps('motion', 'Feel', MOTION, 'How the sky reacts when you disturb it.'))}
        <div className="sky-settings-reset">
            <button type="button" className="sky-settings-reset-button" onClick={() => {
                onReset()
                setFlash(true)
                clearTimeout(flashTimer.current)
                flashTimer.current = setTimeout(() => setFlash(false), 1800)
            }}>Reset to defaults
            </button>
            <p className={flash ? 'sky-settings-status on' : 'sky-settings-status'} role="status">
                {flash ? 'Defaults restored' : 'Applies to your sky as you go · remembered on this device'}</p>
        </div>
    </div>
}

function Row({label, value, hint, children}: { label: string; value?: string; hint?: string; children: ReactNode }) {
    return <div className="sky-settings-row">
        <div className="sky-settings-row-head"><span>{label}</span>{value && <strong>{value}</strong>}</div>
        {children}
        {hint && <p className="sky-settings-hint">{hint}</p>}
    </div>
}

