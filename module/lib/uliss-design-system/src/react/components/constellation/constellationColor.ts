// The constellation colour system. Hue belongs to a root; every level below it
// keeps that hue and picks one of four lightness steps. A root is drawn at Base.
// Colours are OKLCH at one chroma, so the families read evenly in the sky.

/** The 13 root tones (OKLCH hue degrees), in palette order. */
export const CONSTELLATION_PALETTE: readonly number[] = [22, 42, 70, 88, 112, 152, 176, 200, 232, 264, 292, 316, 348]

export type ConstellationLightness = 'DEEP' | 'BASE' | 'LIGHT' | 'PALE'

export interface ConstellationLightnessStep {
    id: ConstellationLightness
    label: string
    /** OKLCH lightness. */
    l: number
}

export const CONSTELLATION_LIGHTNESS_STEPS: readonly ConstellationLightnessStep[] = [
    {id: 'DEEP', label: 'Deep', l: 0.64},
    {id: 'BASE', label: 'Base', l: 0.74},
    {id: 'LIGHT', label: 'Light', l: 0.82},
    {id: 'PALE', label: 'Pale', l: 0.9},
]

const CHROMA = 0.115

/** The CSS colour of a branch: its root's [hue] at its own [lightness] step. */
export function constellationColor(hue: number, lightness: ConstellationLightness = 'BASE'): string {
    const step = CONSTELLATION_LIGHTNESS_STEPS.find((s) => s.id === lightness) ?? CONSTELLATION_LIGHTNESS_STEPS[1]
    return `oklch(${step.l} ${CHROMA} ${hue})`
}
