import {useState} from 'react'
import {OptionCard, StepControl, Swatch} from '@uliss/design-system'
import {SectionLabel, SettingsShell} from './SettingsShell'
import {
    type Accent,
    ACCENTS,
    type Ground,
    GROUNDS,
    type Read,
    READS,
    readTheme,
    type Theme,
    writeTheme,
} from '../ui/theme'

const GROUND_META: Record<Ground, { label: string; note: string; bands: string[] }> = {
    obsidian: {
        label: 'Obsidian',
        note: 'Neutral black grounds',
        bands: ['#0a0a0a', '#0d0d0d', '#0a0a0a', '#161616', '#1c1c1c']
    },
    void: {
        label: 'Deep void',
        note: 'Cool blue-black grounds',
        bands: ['#020407', '#0d0d0d', '#0a0a0a', '#101010', '#1c1c1c']
    },
}

const ACCENT_META: Record<Accent, { label: string; color: string }> = {
    ochre: {label: 'Ochre', color: '#d99a4e'},
    terracotta: {label: 'Terracotta', color: '#c8643c'},
    patina: {label: 'Patina', color: '#5c8a72'},
    bone: {label: 'Bone', color: '#b9a888'},
}

const READ_META: Record<Read, { label: string; px: number }> = {
    compact: {label: 'Compact', px: 13},
    regular: {label: 'Regular', px: 14.5},
    large: {label: 'Large', px: 16},
    larger: {label: 'Larger', px: 18},
}

/**
 * Appearance — the one settings screen wired to real behaviour: it drives the `<html>` theming
 * attributes (`ui/theme.ts`) and persists per device in `localStorage`. Changes apply live to
 * the whole app (CSS custom properties), sign-in excepted.
 */
export function AppearanceSettings() {
    const [theme, setTheme] = useState<Theme>(readTheme)

    const set = (patch: Partial<Theme>) => {
        const next = {...theme, ...patch}
        setTheme(next)
        writeTheme(next)
    }

    return (
        <SettingsShell kicker="Appearance">
            <SectionLabel>Ground</SectionLabel>
            <div className="settings-stack" role="radiogroup" aria-label="Ground">
                {GROUNDS.map((g) => {
                    const m = GROUND_META[g]
                    return (
                        <OptionCard
                            key={g}
                            label={m.label}
                            note={m.note}
                            on={theme.ground === g}
                            onPick={() => set({ground: g})}
                            preview={m.bands.map((c, i) => (
                                <span key={i} style={{flex: 1, background: c}}/>
                            ))}
                        />
                    )
                })}
            </div>

            <SectionLabel>Accent</SectionLabel>
            <div className="settings-swatches" role="radiogroup" aria-label="Accent">
                {ACCENTS.map((a) => (
                    <Swatch
                        key={a}
                        label={ACCENT_META[a].label}
                        color={ACCENT_META[a].color}
                        on={theme.accent === a}
                        onPick={() => set({accent: a})}
                    />
                ))}
            </div>

            <SectionLabel>Text size</SectionLabel>
            <StepControl
                label="Text size"
                big
                value={theme.read}
                steps={READS.map((r) => ({id: r, label: READ_META[r].label}))}
                onPick={(id) => set({read: id as Read})}
                renderStep={(s, on) => (
                    <span style={{
                        fontFamily: 'var(--font-text)',
                        fontSize: READ_META[s.id as Read].px,
                        lineHeight: 1,
                        color: on ? 'var(--read-fg)' : 'var(--text-muted)',
                    }}>Aa</span>
                )}
            />
            <div
                className="settings-reading-sample"
                style={{fontSize: 'var(--read-size)', lineHeight: 'var(--read-leading)'}}
            >
                A recurring thread in your notes — constraints make you more creative, not less.
                Link it under “Creative constraint”?
            </div>

            <p className="settings-foot-note">Applies everywhere except sign in · remembered on this device</p>
        </SettingsShell>
    )
}
