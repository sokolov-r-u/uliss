import {useEffect, useRef, useState} from 'react'
import {
    Bubble,
    Button,
    ChatDock,
    Dialog,
    EmptyState,
    Icon,
    IconButton,
    Kicker,
    ListHeader,
    ListRow,
    NavRow,
    Notice,
    OptionList,
    Select,
    TextField,
    TopBar,
    Wordmark
} from '@uliss/design-system'
import {NotesView} from '../src/notes/NotesPage'
import {NoteDetailView} from '../src/notes/NoteDetailPage'
import {SearchView} from '../src/search/SearchPage'
import {ConstellationsView} from '../src/constellations/ConstellationsPage'
import {SkyView} from '../src/sky/SkyPage'
import {UpdatesView} from '../src/updates/UpdatesPage'
import {AppearanceSettings} from '../src/settings/AppearanceSettings'
import {SkySettings} from '../src/settings/SkySettings'
import {LanguageSettings} from '../src/settings/LanguageSettings'
import {SettingsShell} from '../src/settings/SettingsShell'
import {CONSTELLATIONS, DECISIONS, NOTES, SEARCH, SKY, UPDATES} from './fixtures'

function AuthFixture({register = false}: { register?: boolean }) {
    return <main className="visual-auth" data-surface="login"><Wordmark size={58}/><Kicker size={9.5} spacing="3.4px"
                                                                                           color="var(--wordmark-login)">Voice
        journal</Kicker>
        <section className="visual-auth-card">
            <div className="visual-auth-tabs">
                <button type="button" aria-pressed={!register}>Sign in</button>
                <button type="button" aria-pressed={register}>Register</button>
            </div>
            <h1>{register ? 'Trace your first star' : 'Return to your sky'}</h1>
            <label>Email<input type="email" placeholder={register ? 'you@uliss.app' : 'wayfarer@uliss.app'}/></label>
            <label>Passphrase<input type="password" placeholder={register ? 'choose a passphrase' : 'your passphrase'}/></label>
            <Button variant="primary" size="lg" full type="submit">{register ? 'Begin' : 'Enter'}</Button>
            <div className="visual-disabled-row"><Button disabled variant="quiet">Link</Button><Button disabled
                                                                                                       variant="quiet">Apple</Button><Button
                disabled variant="quiet">Google</Button></div>
        </section>
    </main>
}

function OnboardingFixture({step}: { step: 'name' | 'profile' | 'busy' }) {
    const [name, setName] = useState(step === 'busy' ? 'Wayfarer' : '')
    return <div className="visual-backdrop"><Notice blocking variant={step === 'name' ? 'framed' : 'plaque'}
                                                    progress={{current: step === 'name' ? 1 : 2, total: 2}}
                                                    greek={step === 'name' ? 'ὄνομα · your name' : 'βίος · about you'}
                                                    title={step === 'name' ? 'What should Uliss call you?' : 'A little about you'}
                                                    primary={step === 'profile' ? 'Save' : 'Continue'}
                                                    busy={step === 'busy'}
                                                    primaryDisabled={step === 'name' && name.trim() === ''}
                                                    skip={step === 'profile' ? 'Skip for now' : undefined}
                                                    onSkip={() => undefined}>
        {step === 'name' || step === 'busy' ?
            <TextField label="Display name" value={name} onChange={(event) => setName(event.target.value)}
                       maxLength={24}/> : <OptionList label="Sex" selected={0} options={['Female', 'Male', 'Other']}/>}
    </Notice></div>
}

const NAV = [
    ['node', 'Chats'], ['journal', 'Notes'], ['constellation', 'Constellations'], ['star', 'Sky'], ['pulse', 'Updates'],
] as const

function ShellFixture({mode}: { mode: 'drawer' | 'rail' | 'sidebar' | 'collapsed' }) {
    const compact = mode === 'rail' || mode === 'collapsed'
    return <div className={`visual-shell ${mode}`}>
        {mode === 'drawer' &&
            <div className="visual-shell-screen"><TopBar label="Notes" count="142" onMenu={() => undefined}/><EmptyState
                title="Nothing written down yet" body="The live screen remains visible beneath the drawer."/></div>}
        <aside aria-label="Primary navigation">
            <header><Wordmark size={24}/><IconButton title="Search"><Icon name="search" size={15}/></IconButton>
            </header>
            <Button variant="quiet" full icon={<Icon name="plus" size={14}/>}>{compact ? null : 'New'}</Button>
            <nav>{NAV.map(([icon, label], index) => <a href="#" key={label}><NavRow icon={<Icon name={icon}/>}
                                                                                    label={compact ? '' : label}
                                                                                    active={index === 1}/></a>)}</nav>
            {!compact && <div className="visual-shell-chats"><Kicker size={9} spacing="2.5px" color="var(--text-faint)">Recent
                chats</Kicker><ListRow title="Morning ritual" date="Jun 21" dots={false}/></div>}
        </aside>
    </div>
}

function ChatsFixture({kind}: { kind: 'empty' | 'list' | 'conversation' | 'streaming' }) {
    const [draft, setDraft] = useState('')
    const [streaming, setStreaming] = useState(kind === 'streaming')
    if (kind === 'empty') return <div className="visual-screen"><EmptyState title="No chats yet"
                                                                            body="Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping."
                                                                            action="Start a chat"/></div>
    if (kind === 'list') return <div className="visual-screen"><ListHeader kicker="Chats" total={38}/>
        <div className="product-list">{NOTES.map((note) => <ListRow key={note.id} title={note.title} date={note.date}
                                                                    meta={<><Icon name="noteDoc"
                                                                                  size={12}/>{note.linkCount}</>}
                                                                    dots={false}/>)}</div>
    </div>
    return <div className="visual-screen visual-chat">
        <div className="message-thread"><Bubble role="uliss">You have come back to this thought three
            times.</Bubble><Bubble role="me">It keeps being the same problem in different clothes.</Bubble><Bubble
            role="uliss">Then the constraint may be a frame, not a wall.<span className="bubble-cursor"/></Bubble></div>
        <ChatDock value={draft} onChange={(event) => setDraft(event.target.value)} voiceDisabled
                  disabled={!streaming && kind === 'streaming'} generationActive={streaming}
                  onStop={() => setStreaming(false)}/></div>
}

function SettingsFixture({kind}: { kind: string }) {
    if (kind === 'appearance') return <AppearanceSettings/>
    if (kind === 'sky') return <SkySettings/>
    if (kind === 'language') return <LanguageSettings/>
    if (kind === 'account') return <SettingsShell kicker="Account"><Kicker size={9} spacing="3px">Profile</Kicker><p
        className="settings-para">Profile details are not available to this client. Account editing is unavailable.</p>
        <Button variant="quiet">Sign out</Button></SettingsShell>
    return <div className="visual-screen"><ListHeader kicker="Settings"/>
        <div className="settings-list"><ListRow title="Appearance" meta="Obsidian · Ochre" dots={false}/><ListRow
            title="Sky" meta="Unavailable" dots={false}/><ListRow title="Account" meta="Sign out" dots={false}/><ListRow
            title="Language" meta="English" dots={false}/></div>
    </div>
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
                                                  options={[{value: 'one', label: 'One'}, {
                                                      value: 'two',
                                                      label: 'Two'
                                                  }]}/></div>
}

export function VisualHarness({scenario}: { scenario: string }) {
    if (scenario === 'login' || scenario === 'register') return <AuthFixture register={scenario === 'register'}/>
    if (scenario.startsWith('onboarding-')) return <OnboardingFixture
        step={scenario.replace('onboarding-', '') as 'name' | 'profile' | 'busy'}/>
    if (scenario.startsWith('shell-')) return <ShellFixture
        mode={scenario.replace('shell-', '') as 'drawer' | 'rail' | 'sidebar' | 'collapsed'}/>
    if (scenario.startsWith('chats-')) return <ChatsFixture
        kind={scenario.replace('chats-', '') as 'empty' | 'list' | 'conversation' | 'streaming'}/>
    if (scenario === 'notes-empty') return <NotesView notes={[]}/>
    if (scenario === 'notes-populated') return <NotesView notes={NOTES} onRename={() => undefined}
                                                          onDelete={() => undefined}/>
    if (scenario === 'notes-menu') return <NotesView notes={NOTES} initialMenuId="142"
                                                     onRename={() => undefined} onDelete={() => undefined}/>
    if (scenario === 'notes-detail-ready') return <NoteDetailView state={{
        status: 'ready', note: {
            id: 'note-1', source: 'CHAT_SUMMARY', status: 'READY',
            content: 'Constraints are not always walls.\n\nSometimes they are the frame that makes the work legible.',
            createdAt: '2026-09-11T00:00:00Z',
        }
    }}/>
    if (scenario === 'notes-detail-generating') return <NoteDetailView state={{
        status: 'generating', note: {
            id: 'note-1', source: 'CHAT_SUMMARY', status: 'GENERATING', content: null,
        }
    }}/>
    if (scenario === 'notes-detail-failed') return <NoteDetailView state={{
        status: 'failed', note: {
            id: 'note-1', source: 'CHAT_SUMMARY', status: 'FAILED', content: null,
        }
    }}/>
    if (scenario === 'notes-detail-error') return <NoteDetailView state={{status: 'error', message: 'Connection lost.'}}
                                                                  onRetry={() => undefined}/>
    if (scenario === 'search-empty') return <SearchView query="ritual" model={{totalNotes: 0, notes: [], chats: []}}
                                                        onQueryChange={() => undefined}/>
    if (scenario === 'search-populated') return <SearchView query="ritual" model={SEARCH}
                                                            onQueryChange={() => undefined}/>
    if (scenario === 'constellations-empty') return <ConstellationsView nodes={[]}/>
    if (scenario === 'constellations-populated') return <ConstellationsView nodes={CONSTELLATIONS}/>
    if (scenario === 'sky-empty') return <SkyView model={null} disabled/>
    if (scenario === 'sky-populated') return <SkyView model={SKY}/>
    if (scenario === 'updates-empty') return <UpdatesView updates={[]} decisions={[]}/>
    if (scenario === 'updates-populated') return <UpdatesView updates={UPDATES} decisions={DECISIONS}/>
    if (scenario.startsWith('settings-')) return <SettingsFixture kind={scenario.replace('settings-', '')}/>
    if (scenario === 'dialog') return <DialogFixture/>
    if (scenario === 'select-disabled-open') return <DisabledOpenSelectFixture/>
    return <div className="visual-screen"><EmptyState title="Unknown visual scenario" body={scenario}/></div>
}
