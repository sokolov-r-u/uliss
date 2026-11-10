import {type ReactNode, useEffect, useRef, useState} from 'react'
import {Kicker, SettingsToggle, StepControl, useMessages} from '@uliss/design-system'
import type {SkySettings} from './skySettings'
import {type SkyStepWord, skySettingsMessages} from './skySettings.messages'
import './sky.css'

type Steps<K extends keyof SkySettings> = { id: SkySettings[K] & string; label: SkyStepWord }[]

const LABELS: Steps<'labels'> = [{id: 'always', label: 'always'}, {id: 'auto', label: 'auto'}, {id: 'off', label: 'off'}]
const LABEL_SIZE: Steps<'labelSize'> = [
    {id: 'small', label: 'small'}, {id: 'regular', label: 'regular'}, {id: 'large', label: 'large'},
    {id: 'largest', label: 'largest'},
]
const NEAR_REACH: Steps<'nearReach'> = [
    {id: 'close', label: 'close'}, {id: 'medium', label: 'medium'}, {id: 'wide', label: 'wide'},
    {id: 'vast', label: 'vast'},
]
const MARK_SIZE: Steps<'starSize'> = [
    {id: 'fine', label: 'fine'}, {id: 'regular', label: 'regular'}, {id: 'bold', label: 'bold'},
    {id: 'beacon', label: 'beacon'},
]
const COLOUR: Steps<'colour'> = [{id: 'constellation', label: 'constellation'}, {id: 'mono', label: 'mono'}]
const CENTER: Steps<'centerMark'> = [{id: 'ship', label: 'ship'}, {id: 'star', label: 'star'}]
const LINK_DIST: Steps<'linkDist'> = [
    {id: 'close', label: 'close'}, {id: 'comfortable', label: 'comfortable'}, {id: 'roomy', label: 'roomy'},
    {id: 'spacious', label: 'spacious'},
]
const TENSION: Steps<'tension'> = [
    {id: 'slack', label: 'slack'}, {id: 'balanced', label: 'balanced'}, {id: 'taut', label: 'taut'},
    {id: 'rigid', label: 'rigid'},
]
const SECONDARY: Steps<'secondary'> = [
    {id: 'faint', label: 'faint'}, {id: 'gentle', label: 'gentle'}, {id: 'firm', label: 'firm'},
    {id: 'strong', label: 'strong'},
]
const SECONDARY_STYLE: Steps<'secondaryStyle'> = [{id: 'dashed', label: 'dashed'}, {id: 'solid', label: 'solid'}]
const SPREAD: Steps<'spread'> = [
    {id: 'tight', label: 'tight'}, {id: 'balanced', label: 'balanced'}, {id: 'open', label: 'open'},
    {id: 'vast', label: 'vast'},
]
const PULL: Steps<'pull'> = [
    {id: 'loose', label: 'loose'}, {id: 'gentle', label: 'gentle'}, {id: 'firm', label: 'firm'},
    {id: 'tight', label: 'tight'},
]
const MOTION: Steps<'motion'> = [{id: 'calm', label: 'calm'}, {id: 'natural', label: 'natural'}, {id: 'lively', label: 'lively'}]

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
    const t = useMessages(skySettingsMessages)
    const wordOf = (word: SkyStepWord | undefined) => word && t[word]
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
        <Row label={label} hint={hint} value={wordOf(options.find((o) => o.id === settings[key])?.label)}>
            <StepControl label={label} value={settings[key] as string}
                         steps={options.map((option) => ({id: option.id, label: t[option.label]}))}
                         onPick={(id) => onSettings({[key]: id} as Partial<SkySettings>)}/>
        </Row>

    const toggle = (key: 'mixColours' | 'glow' | 'posters' | 'midStars', label: string, hint: string) =>
        <SettingsToggle className="sky-settings-toggle" label={label} hint={hint} on={settings[key]} divider
                        onChange={(on) => onSettings({[key]: on})}/>

    return <div className="sky-settings">
        {section('labels', t.labels, <>
            {steps('labels', t.showNames, LABELS, t.showNamesHint)}
            {settings.labels === 'auto' && <Row label={t.howMany} hint={t.howManyHint}>
                <input type="range" className="sky-settings-range" aria-label={t.howMany} min={0} max={100}
                       step={5} value={settings.labelDensity}
                       onChange={(event) => onSettings({labelDensity: Number(event.target.value)})}/>
                <span className="sky-settings-ends"><span>{t.fewer}</span><span>{t.more}</span></span>
            </Row>}
            {steps('labelSize', t.textSize, LABEL_SIZE)}
            <NearNamesRows settings={settings} onSettings={onSettings}/>
            {settings.nearCount > 0 && steps('nearReach', t.reach, NEAR_REACH, t.reachHint)}
        </>)}
        {section('stars', t.stars, <>
            {steps('starSize', t.starSize, MARK_SIZE)}
            {steps('constellationSize', t.constellationSize, MARK_SIZE, t.constellationSizeHint)}
            {steps('colour', t.colour, COLOUR, t.colourHint)}
            {toggle('mixColours', t.mixColours, t.mixColoursHint)}
            {toggle('glow', t.glow, t.glowHint)}
            {toggle('posters', t.posters, t.postersHint)}
        </>)}
        {section('center', t.center, steps('centerMark', t.startingPoint, CENTER, t.startingPointHint))}
        {section('connections', t.connections, <>
            {steps('linkDist', t.linkDist, LINK_DIST)}
            {steps('tension', t.tension, TENSION, t.tensionHint)}
            {steps('secondary', t.secondary, SECONDARY, t.secondaryHint)}
            {steps('secondaryStyle', t.secondaryStyle, SECONDARY_STYLE, t.secondaryStyleHint)}
            {toggle('midStars', t.midStars, t.midStarsHint)}
        </>)}
        {section('room', t.room, <>
            {steps('spread', t.spread, SPREAD, t.spreadHint)}
            {steps('pull', t.pull, PULL, t.pullHint)}
        </>)}
        {section('movement', t.movement, steps('motion', t.feel, MOTION, t.feelHint))}
        <div className="sky-settings-reset">
            <button type="button" className="sky-settings-reset-button" onClick={() => {
                onReset()
                setFlash(true)
                clearTimeout(flashTimer.current)
                flashTimer.current = setTimeout(() => setFlash(false), 1800)
            }}>{t.reset}
            </button>
            <p className={flash ? 'sky-settings-status on' : 'sky-settings-status'} role="status">
                {flash ? t.restored : t.appliesNote}</p>
        </div>
    </div>
}

/** "Names near the pointer": how many stars around the mouse are named; 0 turns it off. */
export function NearNamesRows({settings, onSettings}: {
    settings: SkySettings
    onSettings: (patch: Partial<SkySettings>) => void
}) {
    const t = useMessages(skySettingsMessages)
    return <Row label={t.nearNames} value={settings.nearCount === 0 ? t.off : String(settings.nearCount)}
                hint={t.nearNamesHint}>
        <input type="range" className="sky-settings-range" aria-label={t.nearNames} min={0} max={10} step={1}
               value={settings.nearCount} onChange={(event) => onSettings({nearCount: Number(event.target.value)})}/>
        <span className="sky-settings-ends"><span>{t.off}</span><span>10</span></span>
    </Row>
}

function Row({label, value, hint, children}: { label: string; value?: string; hint?: string; children: ReactNode }) {
    return <div className="sky-settings-row">
        <div className="sky-settings-row-head"><span>{label}</span>{value && <strong>{value}</strong>}</div>
        {children}
        {hint && <p className="sky-settings-hint">{hint}</p>}
    </div>
}

