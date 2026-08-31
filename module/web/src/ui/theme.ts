/**
 * Per-device appearance (Settings › Appearance) — the three design-system theming attributes on
 * `<html>` (`data-ground` / `data-accent` / `data-read`), persisted to `localStorage` and
 * re-applied on boot from `main.tsx`. Sign-in ignores this (it pins its own `data-surface="login"`).
 */

export type Ground = 'obsidian' | 'void'
export type Accent = 'ochre' | 'terracotta' | 'patina' | 'bone'
export type Read = 'compact' | 'regular' | 'large' | 'larger'

export type Theme = { ground: Ground; accent: Accent; read: Read }

export const GROUNDS: Ground[] = ['obsidian', 'void']
export const ACCENTS: Accent[] = ['ochre', 'terracotta', 'patina', 'bone']
export const READS: Read[] = ['compact', 'regular', 'large', 'larger']

export const DEFAULT_THEME: Theme = {ground: 'obsidian', accent: 'ochre', read: 'regular'}

const KEY = 'uliss.appearance'

function oneOf<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export function readTheme(): Theme {
    try {
        const raw = localStorage.getItem(KEY)
        if (!raw) return DEFAULT_THEME
        const p = JSON.parse(raw) as Partial<Theme>
        return {
            ground: oneOf(GROUNDS, p.ground, DEFAULT_THEME.ground),
            accent: oneOf(ACCENTS, p.accent, DEFAULT_THEME.accent),
            read: oneOf(READS, p.read, DEFAULT_THEME.read),
        }
    } catch {
        return DEFAULT_THEME
    }
}

export function applyTheme(theme: Theme): void {
    const el = document.documentElement
    el.dataset.ground = theme.ground
    el.dataset.accent = theme.accent
    el.dataset.read = theme.read
}

export function writeTheme(theme: Theme): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(theme))
    } catch {
        // private mode / storage disabled — the choice just won't survive a reload
    }
    applyTheme(theme)
}
