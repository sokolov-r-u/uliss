import type {ButtonHTMLAttributes} from 'react'
import {Icon, type IconName} from '../icons/Icon'
import {useMessages} from '../../i18n/LocaleContext'
import {actionChipMessages} from './ActionChip.messages'

// The small bordered action that sits inside content rather than chrome —
// "Update", "Summarize". 26px tall, accent border, glyph first.
export interface ActionChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    label?: string
    icon?: IconName | null
}

export function ActionChip({
                               label: labelProp,
                               icon = 'summary',
                               type = 'button',
                               disabled = false,
                               ...buttonProps
                           }: ActionChipProps) {
    const t = useMessages(actionChipMessages)
    const label = labelProp ?? t.summarize
    return (
        <button
            {...buttonProps}
            type={type}
            disabled={disabled}
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
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'color var(--dur-hover) var(--ease)',
                // a caller's style refines the chip instead of being dropped
                ...buttonProps.style,
            }}
        >
            {icon && <Icon name={icon} size={12}/>}
            {label}
        </button>
    )
}
