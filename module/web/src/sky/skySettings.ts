/**
 * Settings › Sky: how the user's sky looks and moves. Every choice is a word, never a number; the tables below turn
 * words into the renderer's coefficients, so the panel never knows a physics unit. Stored per device in
 * `localStorage` (like the appearance), versioned and merged with the defaults on read.
 */

export const LABEL_MODES = ['always', 'auto', 'off'] as const
export const LABEL_SIZES = ['small', 'regular', 'large', 'largest'] as const
export const MARK_SIZES = ['fine', 'regular', 'bold', 'beacon'] as const
export const NEAR_REACHES = ['close', 'medium', 'wide', 'vast'] as const
export const COLOURS = ['constellation', 'mono'] as const
export const CENTER_MARKS = ['ship', 'star'] as const
export const LINK_DISTANCES = ['close', 'comfortable', 'roomy', 'spacious'] as const
export const TENSIONS = ['slack', 'balanced', 'taut', 'rigid'] as const
export const SECONDARY_PULLS = ['faint', 'gentle', 'firm', 'strong'] as const
export const SECONDARY_STYLES = ['dashed', 'solid'] as const
export const SPREADS = ['tight', 'balanced', 'open', 'vast'] as const
export const CENTRE_PULLS = ['loose', 'gentle', 'firm', 'tight'] as const
export const MOTIONS = ['calm', 'natural', 'lively'] as const

type Of<T extends readonly string[]> = T[number]

export interface SkySettings {
    labels: Of<typeof LABEL_MODES>
    /** 0–100; 50 is the sky's own judgement of how many names fit. */
    labelDensity: number
    labelSize: Of<typeof LABEL_SIZES>
    /** How many stars around the mouse are named, 0–10; 0 turns it off. */
    nearCount: number
    /** How far from the mouse those stars may be. */
    nearReach: Of<typeof NEAR_REACHES>
    starSize: Of<typeof MARK_SIZES>
    constellationSize: Of<typeof MARK_SIZES>
    colour: Of<typeof COLOURS>
    /** A star in several constellations is split into sectors of their colours instead of its main one's. */
    mixColours: boolean
    glow: boolean
    centerMark: Of<typeof CENTER_MARKS>
    linkDist: Of<typeof LINK_DISTANCES>
    tension: Of<typeof TENSIONS>
    secondary: Of<typeof SECONDARY_PULLS>
    secondaryStyle: Of<typeof SECONDARY_STYLES>
    midStars: boolean
    spread: Of<typeof SPREADS>
    pull: Of<typeof CENTRE_PULLS>
    motion: Of<typeof MOTIONS>
}

export const DEFAULT_SKY_SETTINGS: SkySettings = {
    labels: 'auto',
    labelDensity: 50,
    labelSize: 'regular',
    nearCount: 5,
    nearReach: 'medium',
    starSize: 'regular',
    constellationSize: 'regular',
    colour: 'constellation',
    mixColours: false,
    glow: true,
    centerMark: 'ship',
    linkDist: 'comfortable',
    tension: 'balanced',
    secondary: 'gentle',
    secondaryStyle: 'dashed',
    midStars: true,
    spread: 'balanced',
    pull: 'gentle',
    motion: 'natural',
}

const KEY = 'uliss.sky'
const VERSION = 1

/** Fired on `window` after `writeSkySettings`, so the open sky and the settings page read the same values. */
export const SKY_SETTINGS_EVENT = 'uliss:sky-settings'

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

function flag(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
}

/** Keeps every known, valid value of [raw]; anything else falls back to the default. */
export function parseSkySettings(raw: unknown): SkySettings {
    const d = DEFAULT_SKY_SETTINGS
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d
    const p = raw as Record<string, unknown>
    const nearCount = typeof p.nearCount === 'number' && Number.isFinite(p.nearCount)
        ? Math.min(10, Math.max(0, Math.round(p.nearCount))) : d.nearCount
    const density = typeof p.labelDensity === 'number' && Number.isFinite(p.labelDensity)
        ? Math.min(100, Math.max(0, Math.round(p.labelDensity))) : d.labelDensity
    return {
        labels: oneOf(LABEL_MODES, p.labels, d.labels),
        labelDensity: density,
        labelSize: oneOf(LABEL_SIZES, p.labelSize, d.labelSize),
        nearCount,
        nearReach: oneOf(NEAR_REACHES, p.nearReach, d.nearReach),
        starSize: oneOf(MARK_SIZES, p.starSize, d.starSize),
        constellationSize: oneOf(MARK_SIZES, p.constellationSize, d.constellationSize),
        colour: oneOf(COLOURS, p.colour, d.colour),
        mixColours: flag(p.mixColours, d.mixColours),
        glow: flag(p.glow, d.glow),
        centerMark: oneOf(CENTER_MARKS, p.centerMark, d.centerMark),
        linkDist: oneOf(LINK_DISTANCES, p.linkDist, d.linkDist),
        tension: oneOf(TENSIONS, p.tension, d.tension),
        secondary: oneOf(SECONDARY_PULLS, p.secondary, d.secondary),
        secondaryStyle: oneOf(SECONDARY_STYLES, p.secondaryStyle, d.secondaryStyle),
        midStars: flag(p.midStars, d.midStars),
        spread: oneOf(SPREADS, p.spread, d.spread),
        pull: oneOf(CENTRE_PULLS, p.pull, d.pull),
        motion: oneOf(MOTIONS, p.motion, d.motion),
    }
}

/** The last written settings, for a browser without storage: they last until the page reloads. */
let lastWritten: SkySettings | null = null

export function readSkySettings(): SkySettings {
    try {
        const raw = localStorage.getItem(KEY)
        if (!raw) return lastWritten ?? DEFAULT_SKY_SETTINGS
        const stored: unknown = JSON.parse(raw)
        // A future version may rename fields; values this version still knows are kept.
        const values = typeof stored === 'object' && stored !== null && 'values' in stored
            ? (stored as { values: unknown }).values : stored
        return parseSkySettings(values)
    } catch {
        return lastWritten ?? DEFAULT_SKY_SETTINGS
    }
}

export function writeSkySettings(settings: SkySettings): void {
    lastWritten = settings
    try {
        localStorage.setItem(KEY, JSON.stringify({version: VERSION, values: settings}))
    } catch {
        // private mode / storage disabled — the choice just won't survive a reload
    }
    window.dispatchEvent(new Event(SKY_SETTINGS_EVENT))
}

/** The renderer's coefficients for [settings]; the only place words become numbers. */
export interface SkyPhysics {
    linkDist: number
    tension: number
    repulsion: number
    gravity: number
    alphaDecay: number
    secondaryPull: number
    labelScale: number
    starScale: number
    constellationScale: number
    /** Scales every zoom threshold of Auto names: lower shows more names. */
    labelGain: number
    /** Screen px around the mouse within which stars are named. */
    nearRadius: number
}

const LINK_DIST: Record<SkySettings['linkDist'], number> = {close: 104, comfortable: 150, roomy: 208, spacious: 276}
const TENSION: Record<SkySettings['tension'], number> = {slack: 0.6, balanced: 1, taut: 1.5, rigid: 2.1}
const SPREAD: Record<SkySettings['spread'], number> = {tight: -120, balanced: -200, open: -320, vast: -470}
const CENTRE_PULL: Record<SkySettings['pull'], number> = {loose: 0.12, gentle: 0.3, firm: 0.5, tight: 0.78}
// alpha decay of a disturbed sky: Calm settles quickly, Lively keeps moving longer
const MOTION: Record<SkySettings['motion'], number> = {calm: 0.06, natural: 0.035, lively: 0.018}
const SECONDARY_PULL: Record<SkySettings['secondary'], number> = {faint: 0.12, gentle: 0.3, firm: 0.6, strong: 1}
const LABEL_SCALE: Record<SkySettings['labelSize'], number> = {small: 0.85, regular: 1, large: 1.2, largest: 1.45}
const NEAR_RADIUS: Record<SkySettings['nearReach'], number> = {close: 60, medium: 120, wide: 200, vast: 300}
const MARK_SCALE: Record<SkySettings['starSize'], number> = {fine: 0.7, regular: 1, bold: 1.35, beacon: 1.75}

export function skyPhysics(settings: SkySettings): SkyPhysics {
    return {
        linkDist: LINK_DIST[settings.linkDist],
        tension: TENSION[settings.tension],
        repulsion: SPREAD[settings.spread],
        gravity: CENTRE_PULL[settings.pull],
        alphaDecay: MOTION[settings.motion],
        secondaryPull: SECONDARY_PULL[settings.secondary],
        labelScale: LABEL_SCALE[settings.labelSize],
        starScale: MARK_SCALE[settings.starSize],
        constellationScale: MARK_SCALE[settings.constellationSize],
        labelGain: Math.max(0.08, 1 - (settings.labelDensity - 50) / 50 * 0.92),
        nearRadius: NEAR_RADIUS[settings.nearReach],
    }
}
