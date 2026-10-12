import {useEffect, useRef, useState} from 'react'
import {Bubble, ChatDock, Dialog, EmptyState, Select} from '@uliss/design-system'
import {SkyView} from '../src/sky/SkyPage'
import {SKY} from './fixtures'

/**
 * Isolated component scenarios for the keyboard specs — behaviour the real screens cannot reach without a backend
 * (a populated sky, a live generation) or that needs a controlled setup. Screens themselves render the real `App`
 * (see `main.tsx`).
 */

function StreamingFixture() {
    const [draft, setDraft] = useState('')
    const [streaming, setStreaming] = useState(true)
    return <div className="visual-screen visual-chat">
        <div className="message-thread"><Bubble role="uliss">You have come back to this thought three
            times.</Bubble><Bubble role="me">It keeps being the same problem in different clothes.</Bubble></div>
        <ChatDock value={draft} onChange={(event) => setDraft(event.target.value)} voiceDisabled
                  disabled={!streaming} generationActive={streaming} onStop={() => setStreaming(false)}/></div>
}

function DialogFixture() {
    const [open, setOpen] = useState(false)
    const opener = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        opener.current?.focus()
        setOpen(true)
    }, [])
    return <div className="visual-screen">
        <button ref={opener} type="button" className="visual-opener" onClick={() => setOpen(true)}>Return focus</button>
        {open && <Dialog danger title="Delete “The empty room”?"
                         body="The note goes. The chats it came from stay, and so do its constellations."
                         confirm="Delete" cancel="Keep" onCancel={() => setOpen(false)}
                         onConfirm={() => setOpen(false)}/>}</div>
}

function DisabledOpenSelectFixture() {
    return <div className="visual-screen"><Select aria-label="Disabled controlled select" value="one"
                                                  onChange={() => undefined} open disabled
                                                  options={[{value: 'one', label: 'One'}, {value: 'two', label: 'Two'}]}/>
    </div>
}

export function VisualHarness({scenario}: { scenario: string }) {
    if (scenario === 'chats-streaming') return <StreamingFixture/>
    if (scenario === 'dialog') return <DialogFixture/>
    if (scenario === 'select-disabled-open') return <DisabledOpenSelectFixture/>
    if (scenario === 'sky-populated') return <div className="visual-screen"><SkyView model={SKY}/></div>
    return <div className="visual-screen"><EmptyState title="Unknown visual scenario" body={scenario}/></div>
}
