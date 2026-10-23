import type {CSSProperties, ReactNode} from 'react'

// A note's name as the user sees it: emoji, space, name. In a list a note without
// an emoji keeps an empty slot of the same width, so every name starts at the
// same x; alone (a heading, a path) it is just the name.

export interface NoteTitleProps {
    title: ReactNode
    /** The note's emoji; null or absent for none. */
    icon?: string | null
    /** In a list: reserve the emoji's slot even without one. */
    slot?: boolean
}

const SLOT: CSSProperties = {
    display: 'inline-block',
    width: '1.25em',
    marginRight: '0.3em',
    textAlign: 'center',
    lineHeight: 1,
}

export function NoteTitle({title, icon, slot = false}: NoteTitleProps) {
    if (!icon && !slot) return <>{title}</>
    return <>
        {icon
            ? <span data-note-icon="" style={SLOT}>{icon}</span>
            : <span data-note-icon="" aria-hidden="true" style={SLOT}/>}
        {/* a real space, so copied text and accessible names read "🎷 Giant Steps" */}
        {icon && <span style={{fontSize: 0}}> </span>}
        {title}
    </>
}

/** The name with its emoji as one string, for accessible names, paths and canvas labels. */
export function noteTitleText(title: string, icon: string | null | undefined): string {
    return icon ? `${icon} ${title}` : title
}
