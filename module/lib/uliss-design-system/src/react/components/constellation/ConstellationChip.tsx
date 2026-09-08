import {TagDot} from './TagDot'

export interface ConstellationChipProps {
    label: string
    color: string
    /** sm inside dense rows and lists; md on the note meta plate. */
    size?: 'sm' | 'md'
    /** Shows a × — only where the user owns the membership. */
    onRemove?: () => void
    onClick?: () => void
}

/** Secondary membership with independent native label and remove actions. */
export function ConstellationChip({label, color, size = 'md', onRemove, onClick}: ConstellationChipProps) {
    const sm = size === 'sm'
    const content = <><TagDot color={color} size={sm ? 5 : 7}/><span style={{
        fontFamily: 'var(--font-text)',
        fontSize: sm ? 10 : 11,
        letterSpacing: '0.8px',
        color: 'var(--cream-dim)'
    }}>{label}</span></>
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: sm ? 5 : 6}}>
            {onClick ? (
                <button type="button" onClick={onClick} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: sm ? 5 : 6,
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer'
                }}>{content}</button>
            ) : content}
            {onRemove && <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}
                                 style={{
                                     color: 'var(--text-faint)',
                                     fontFamily: 'var(--font-text)',
                                     fontSize: 11,
                                     cursor: 'pointer',
                                     padding: '0 2px',
                                     border: 0,
                                     background: 'transparent'
                                 }}>×</button>}
        </span>
    )
}
