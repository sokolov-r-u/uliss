import {ActionChip, ChatDock} from '@uliss/design-system'
import {useState} from 'react'
import {Ground} from '../preview-kit/Ground'

export const Empty = () => {
    const [draft, setDraft] = useState('')
    return (
        <Ground width={380} pad={0}>
            <ChatDock placeholder="Write a thought…" value={draft} onChange={(e) => setDraft(e.target.value)}
                      onSubmit={(e) => e.preventDefault()} voiceDisabled/>
        </Ground>
    )
}

export const WithDraftAndOffer = () => {
    const [draft, setDraft] = useState('It keeps being the same problem in different clothes.')
    return (
        <Ground width={380} pad={0}>
            <ChatDock placeholder="Write a thought…" value={draft} onChange={(e) => setDraft(e.target.value)}
                      onSubmit={(e) => e.preventDefault()} voiceDisabled>
                <ActionChip label="Summarize" icon="summary"/>
            </ChatDock>
        </Ground>
    )
}

export const Generating = () => (
    <Ground width={380} pad={0}>
        <ChatDock placeholder="Write a thought…" value="" onChange={() => undefined} generationActive
                  onStop={() => undefined}/>
    </Ground>
)

export const Disabled = () => (
    <Ground width={380} pad={0}>
        <ChatDock placeholder="Write a thought…" value="" onChange={() => undefined} disabled voiceDisabled/>
    </Ground>
)

const voice = (state: 'recording' | 'transcribing' | 'failed') => ({
    state,
    elapsedSeconds: 42,
    maxSeconds: 300,
    onStart: () => undefined,
    onStop: () => undefined,
    onSend: () => undefined,
    onRetry: () => undefined,
})

export const Recording = () => (
    <Ground width={380} pad={0}>
        <ChatDock placeholder="Write a thought…" value="" onChange={() => undefined} voice={voice('recording')}/>
    </Ground>
)

export const Transcribing = () => (
    <Ground width={380} pad={0}>
        <ChatDock placeholder="Write a thought…" value="Earlier draft" onChange={() => undefined}
                  voice={voice('transcribing')}/>
    </Ground>
)

export const TranscriptionFailed = () => {
    const [draft, setDraft] = useState('')
    return (
        <Ground width={380} pad={0}>
            <ChatDock placeholder="Write a thought…" value={draft} onChange={(e) => setDraft(e.target.value)}
                      onSubmit={(e) => e.preventDefault()} voice={voice('failed')}/>
        </Ground>
    )
}
