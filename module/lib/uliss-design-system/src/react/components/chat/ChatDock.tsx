import type {ChangeEventHandler, FormEventHandler, KeyboardEventHandler, ReactNode} from 'react'
import {useLayoutEffect, useRef} from 'react'
import {Icon} from '../icons/Icon'
import {IconButton} from '../actions/IconButton'

const TEXTAREA_MIN_HEIGHT = 34
const TEXTAREA_MAX_HEIGHT = 144

export interface ChatDockProps {
    placeholder?: string
    value: string
    onChange: ChangeEventHandler<HTMLTextAreaElement>
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
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useLayoutEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.style.height = '0px'
        const height = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(input.scrollHeight, TEXTAREA_MAX_HEIGHT))
        input.style.height = `${height}px`
        input.style.overflowY = input.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
    }, [value])

    const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        if (!disabled && !generationActive && value.trim() !== '') {
            event.currentTarget.form?.requestSubmit()
        }
    }

    return (
        <form className={className} onSubmit={onSubmit} style={{padding: '10px 16px 18px', flex: '0 0 auto'}}>
            {children && <div style={{display: 'flex', justifyContent: 'center', marginBottom: 10}}>{children}</div>}
            <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                minHeight: 46,
                padding: '5px 6px 5px 16px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--line-strong)'
            }}>
                <textarea
                    ref={inputRef}
                    rows={1}
                    wrap="soft"
                    value={value}
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled || generationActive}
                    aria-label="Message"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        maxHeight: TEXTAREA_MAX_HEIGHT,
                        border: 0,
                        outline: 0,
                        padding: '7px 0',
                        resize: 'none',
                        overflowX: 'hidden',
                        overflowY: 'hidden',
                        background: 'transparent',
                        color: 'var(--cream)',
                        fontFamily: 'var(--font-text)',
                        fontSize: 12.5,
                        lineHeight: '20px',
                        letterSpacing: '0.3px',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal'
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
