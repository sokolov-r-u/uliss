import {useState} from 'react'
import {Icon, Kicker, OptionCard, StepControl, Swatch, useMessages} from '@uliss/design-system'
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
import {appearanceMessages} from './appearance.messages'

const GROUND_META: Record<Ground, { label: 'obsidian' | 'void'; note: 'obsidianNote' | 'voidNote'; bands: string[] }> = {
    obsidian: {
        label: 'obsidian',
        note: 'obsidianNote',
        bands: ['#0a0a0a', '#0d0d0d', '#0a0a0a', '#161616', '#1c1c1c']
    },
    void: {
        label: 'void',
        note: 'voidNote',
        bands: ['#020407', '#0d0d0d', '#0a0a0a', '#101010', '#1c1c1c']
    },
}

const ACCENT_COLORS: Record<Accent, string> = {
    ochre: '#d99a4e',
    terracotta: '#c8643c',
    patina: '#5c8a72',
    bone: '#b9a888',
}

const READ_PX: Record<Read, number> = {
    compact: 13,
    regular: 14.5,
    large: 16,
    larger: 18,
}

/**
 * Appearance — the one settings screen wired to real behaviour: it drives the `<html>` theming
 * attributes (`ui/theme.ts`) and persists per device in `localStorage`. Changes apply live to
 * the whole app (CSS custom properties), sign-in excepted.
 */
export function AppearanceSettings() {
    const t = useMessages(appearanceMessages)
    const [theme, setTheme] = useState<Theme>(readTheme)

    const set = (patch: Partial<Theme>) => {
        const next = {...theme, ...patch}
        setTheme(next)
        writeTheme(next)
    }

    return (
        <SettingsShell kicker={t.kicker}>
            <SectionLabel>{t.ground}</SectionLabel>
            <div className="settings-stack" role="radiogroup" aria-label={t.ground}>
                {GROUNDS.map((g) => {
                    const m = GROUND_META[g]
                    return (
                        <OptionCard
                            key={g}
                            label={t[m.label]}
                            note={t[m.note]}
                            on={theme.ground === g}
                            onPick={() => set({ground: g})}
                            preview={m.bands.map((c, i) => (
                                <span key={i} style={{flex: 1, background: c}}/>
                            ))}
                        />
                    )
                })}
            </div>

            <SectionLabel>{t.accent}</SectionLabel>
            <div className="settings-swatches" role="radiogroup" aria-label={t.accent}>
                {ACCENTS.map((a, index) => (
                    <Swatch
                        key={a}
                        label={t[a]}
                        color={ACCENT_COLORS[a]}
                        on={theme.accent === a}
                        onPick={() => set({accent: a})}
                        // one tab stop: the chosen accent, or the first when none matches
                        tabIndex={theme.accent === a || (!ACCENTS.includes(theme.accent) && index === 0) ? 0 : -1}
                    />
                ))}
            </div>

            <SectionLabel>{t.textSize}</SectionLabel>
            <StepControl
                label={t.textSize}
                big
                value={theme.read}
                steps={READS.map((r) => ({id: r, label: t[r]}))}
                onPick={(id) => set({read: id as Read})}
                renderStep={(s, on) => (
                    <span style={{
                        fontFamily: 'var(--font-text)',
                        fontSize: READ_PX[s.id as Read],
                        lineHeight: 1,
                        color: on ? 'var(--read-fg)' : 'var(--text-muted)',
                    }}>Aa</span>
                )}
            />
            <div
                className="settings-reading-sample"
                style={{fontSize: 'var(--read-size)', lineHeight: 'var(--read-leading)'}}
            >
                {t.sample}
            </div>

            <SectionLabel>{t.preview}</SectionLabel>
            <div className="settings-preview" aria-label={t.preview}>
                <span className="settings-preview-kicker"><Icon name="star" size={13}/>
                    <Kicker size={9} spacing="3px" color="var(--text-faint)">{t.previewKicker}</Kicker></span>
                <span className="settings-preview-text">{t.previewText}</span>
                <span className="settings-preview-action">{t.previewAction}</span>
            </div>

            <p className="settings-foot-note">{t.footNote}</p>
        </SettingsShell>
    )
}
