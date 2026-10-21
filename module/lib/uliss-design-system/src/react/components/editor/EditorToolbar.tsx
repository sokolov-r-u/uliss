import type {CSSProperties, ReactNode} from 'react'
import {Icon} from '../icons/Icon'

// The formatting strip above a note being edited: a few marks, two lists,
// undo/redo, and the "Original" switch that swaps the editor for the saved
// version. Square, borderless glyph buttons on a hairline; a pressed format
// takes the accent. The toolbar only reports commands — the editor owns the
// document and tells it which formats are active.

export type EditorCommand = 'bold' | 'italic' | 'heading' | 'bulletList' | 'orderedList' | 'undo' | 'redo'

export interface EditorToolbarProps {
    onCommand: (command: EditorCommand) => void
    /** Formats active at the caret; their buttons read as pressed. */
    active?: Partial<Record<EditorCommand, boolean>>
    /** Commands that cannot run now, e.g. undo with an empty history. */
    unavailable?: Partial<Record<EditorCommand, boolean>>
    /** The saved version is shown instead of the editor; formatting is off while it is. */
    original: boolean
    onOriginalChange: (original: boolean) => void
    /** Locks every button, e.g. while something else is rewriting the note. */
    disabled?: boolean
    style?: CSSProperties
}

interface ToolDef {
    command: EditorCommand
    label: string
    glyph: ReactNode
    toggles: boolean
}

const letter = (text: string, style: CSSProperties) => (
    <span aria-hidden style={{fontFamily: 'var(--font-text)', fontSize: 15, lineHeight: 1, ...style}}>{text}</span>
)

const TOOLS: ToolDef[] = [
    {command: 'bold', label: 'Bold', glyph: letter('B', {fontWeight: 700}), toggles: true},
    {command: 'italic', label: 'Italic', glyph: letter('I', {fontStyle: 'italic'}), toggles: true},
    {command: 'heading', label: 'Heading', glyph: letter('H', {fontWeight: 600}), toggles: true},
    {command: 'bulletList', label: 'Bulleted list', glyph: <Icon name="listBullet" size={17}/>, toggles: true},
    {command: 'orderedList', label: 'Numbered list', glyph: <Icon name="listNumbered" size={17}/>, toggles: true},
    {command: 'undo', label: 'Undo', glyph: <Icon name="undo" size={17}/>, toggles: false},
    {command: 'redo', label: 'Redo', glyph: <Icon name="redo" size={17}/>, toggles: false},
]

const buttonStyle = (pressed: boolean, disabled: boolean): CSSProperties => ({
    minWidth: 'var(--touch)',
    height: 'var(--touch)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 var(--space-2)',
    background: pressed ? 'var(--bg-muted)' : 'transparent',
    border: 'none',
    color: pressed ? 'var(--accent-2)' : 'var(--cream-dim)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'color var(--dur-hover) var(--ease)',
})

export function EditorToolbar({
                                  onCommand,
                                  active = {},
                                  unavailable = {},
                                  original,
                                  onOriginalChange,
                                  disabled = false,
                                  style,
                              }: EditorToolbarProps) {
    return (
        <div role="toolbar" aria-label="Formatting" onKeyDown={(event) => {
            // toolbar pattern: arrows move between the enabled tools
            const tools = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const index = tools.indexOf(document.activeElement as HTMLButtonElement)
            const next = {ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tools.length - 1}[event.key]
            if (index < 0 || next === undefined) return
            event.preventDefault()
            tools[(next + tools.length) % tools.length]?.focus()
        }} style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            borderBottom: '1px solid var(--line)',
            background: 'var(--bg)',
            ...style,
        }}>
            {TOOLS.map((tool, index) => {
                const off = disabled || original || unavailable[tool.command] === true
                const pressed = tool.toggles && active[tool.command] === true
                return (
                    <span key={tool.command} style={{display: 'contents'}}>
                        {(index === 3 || index === 5) && <span aria-hidden style={{
                            width: 1, height: 18, margin: '0 var(--space-1)', background: 'var(--line)',
                        }}/>}
                        <button
                            type="button"
                            title={tool.label}
                            aria-label={tool.label}
                            aria-pressed={tool.toggles ? pressed : undefined}
                            disabled={off}
                            // Keep the caret in the editor: a toolbar click must not take focus from it.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onCommand(tool.command)}
                            style={buttonStyle(pressed && !off, off)}
                        >
                            {tool.glyph}
                        </button>
                    </span>
                )
            })}
            <button
                type="button"
                title="Original"
                aria-label="Original"
                aria-pressed={original}
                disabled={disabled}
                onClick={() => onOriginalChange(!original)}
                style={{
                    ...buttonStyle(original, disabled),
                    marginLeft: 'auto',
                    fontFamily: 'var(--font-text)',
                    fontSize: 9.5,
                    fontWeight: 'var(--w-emphasis)',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                }}
            >
                Original
            </button>
        </div>
    )
}
