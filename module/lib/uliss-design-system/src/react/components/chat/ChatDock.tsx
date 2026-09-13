import type {ChangeEventHandler, FormEventHandler, ReactNode} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'

export interface ChatDockProps {
    placeholder?: string
    value: string
    onChange: ChangeEventHandler<HTMLInputElement>
    onSubmit?: FormEventHandler<HTMLFormElement>
    disabled?: boolean
    voiceDisabled?: boolean
    generationActive?: boolean
    onStop?: () => void
    onMic?: () => void
    /** Centred above the field — reserved for ActionChip. */
    children?: ReactNode
    className?: string
}

/** Native text composer with explicit send and unavailable-voice states. */
export function ChatDock({
                             placeholder = 'Write a thought…',
                             value,
                             onChange,
                             onSubmit,
                             disabled = false,
                             voiceDisabled = false,
                             generationActive = false,
                             onStop,
                             onMic,
                             children,
                             className,
                         }: ChatDockProps) {
    return (
        <form className={className} onSubmit={onSubmit} style={{padding: '10px 16px 18px', flex: '0 0 auto'}}>
            {children && <div style={{display: 'flex', justifyContent: 'center', marginBottom: 10}}>{children}</div>}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 46,
                padding: '0 6px 0 16px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)'
            }}>
                <input
                    type="text"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    disabled={disabled || generationActive}
                    aria-label="Message"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        border: 0,
                        outline: 0,
                        background: 'transparent',
                        color: 'var(--cream)',
                        fontFamily: 'var(--font-text)',
                        fontSize: 12.5,
                        letterSpacing: '0.3px'
                    }}
                />
                <IconButton s={34} title={voiceDisabled ? 'Voice input unavailable' : 'Voice input'}
                            disabled={voiceDisabled || disabled || generationActive} onClick={onMic}
                            style={{background: 'var(--bg-muted)'}}>
                    <Icon name="mic" size={18}/>
                </IconButton>
                {generationActive ? (
                    <IconButton s={34} title="Stop generation" type="button" onClick={onStop}
                                style={{background: 'var(--bg-muted)'}}>
                        <Icon name="stop" size={18}/>
                    </IconButton>
                ) : (
                    <IconButton s={34} title="Send" type="submit" disabled={disabled || value.trim() === ''}
                                style={{background: 'var(--bg-muted)'}}>
                        <Icon name="arrowUp" size={18}/>
                    </IconButton>
                )}
            </div>
        </form>
    )
}
