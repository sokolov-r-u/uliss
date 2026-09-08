import type {ButtonHTMLAttributes, ReactNode} from 'react'

// A bare 30×30 hit target for a single glyph. No border at rest; the glyph
// itself brightens on hover.
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
    children?: ReactNode
    /** Box size in px. 30 default, 44 for phone touch targets. */
    s?: number
    title: string
    color?: string
}

export function IconButton({
                               children,
                               onClick,
                               s = 30,
                               title,
                               color = 'var(--cream-dim)',
                               type = 'button',
                               disabled = false,
                               style,
                               ...buttonProps
                           }: IconButtonProps) {
    return (
        <button
            {...buttonProps}
            type={type}
            title={title}
            aria-label={buttonProps['aria-label'] ?? title}
            disabled={disabled}
            onClick={onClick}
            style={{
                width: s,
                height: s,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                padding: 0,
                transition: 'color var(--dur-hover) var(--ease)',
                ...style,
            }}
        >
            {children}
        </button>
    )
}
