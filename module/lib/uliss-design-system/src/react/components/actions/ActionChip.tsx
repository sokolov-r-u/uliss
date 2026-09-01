import {Icon, type IconName} from '../icons/Icon'

// The small bordered action that sits inside content rather than chrome —
// "Update", "Summarize". 26px tall, accent border, glyph first.
export interface ActionChipProps {
    label?: string
    icon?: IconName | null
    onClick?: () => void
}

export function ActionChip({label = 'Summarize', icon = 'summary', onClick}: ActionChipProps) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 26,
                padding: '0 12px',
                background: 'transparent',
                border: '1px solid var(--accent)',
                color: 'var(--accent-2)',
                fontFamily: 'var(--font-text)',
                fontSize: 9.5,
                fontWeight: 'var(--w-emphasis)',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'color var(--dur-hover) var(--ease)',
            }}
        >
            {icon && <Icon name={icon} size={12}/>}
            {label}
        </button>
    )
}
