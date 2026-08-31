import type {CSSProperties, ReactNode} from 'react'

// Four variants, all rectangular, all uppercase-tracked. Uliss has no filled
// buttons except the notice primary — emphasis is carried by border and colour.
//   primary — accent fill, dark label (the one decisive action in a notice)
//   outline — 1px --accent border, accent-2 label (the default CTA)
//   quiet   — 1px --line-strong border, cream label (secondary / list actions)
//   ghost   — no border, --text-faint label (dismiss, "not now")

export interface ButtonProps {
    children?: ReactNode
    variant?: 'primary' | 'outline' | 'quiet' | 'ghost'
    /** sm 26px (inline chip) · md 36px (chrome) · lg 44px (touch target). */
    size?: 'sm' | 'md' | 'lg'
    full?: boolean
    /** An `<Icon>` placed before the label. */
    icon?: ReactNode
    onClick?: () => void
    style?: CSSProperties
}

export function Button({
                           children,
                           variant = 'outline',
                           onClick,
                           size = 'md',
                           full = false,
                           icon = null,
                           style = {},
                       }: ButtonProps) {
    const h = size === 'lg' ? 44 : size === 'sm' ? 26 : 36
    const fs = size === 'lg' ? 10 : size === 'sm' ? 9.5 : 10
    const base: CSSProperties = {
        display: full ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        minHeight: h,
        padding: size === 'sm' ? '0 12px' : '0 16px',
        width: full ? '100%' : undefined,
        background: 'transparent',
        fontFamily: 'var(--font-text)',
        fontSize: fs,
        fontWeight: 'var(--w-emphasis)',
        letterSpacing: size === 'sm' ? '2px' : '2.5px',
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: 'none',
        transition: 'color var(--dur-hover) var(--ease), border-color var(--dur-hover) var(--ease)',
    }
    const skin: CSSProperties = {
        primary: {background: 'var(--accent)', color: 'var(--bg-deep)', border: '1px solid var(--accent)'},
        outline: {border: '1px solid var(--accent)', color: 'var(--accent-2)'},
        quiet: {border: '1px solid var(--line-strong)', color: 'var(--cream)'},
        ghost: {color: 'var(--text-faint)', padding: 0, minHeight: 'auto'},
    }[variant]
    return (
        <button onClick={onClick} style={{...base, ...skin, ...style}}>
            {icon}
            {children}
        </button>
    )
}
