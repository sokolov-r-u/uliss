import type {Chat, ChatMessage} from '../src/chat/chatApi'
import type {Note} from '../src/notes/noteApi'

// Fixed clock in the specs: 2026-06-24 12:00 UTC. Dates below land in Today / Yesterday / This week / June / May.
const at = (day: string) => `2026-${day}T09:00:00Z`

export const CHATS: Chat[] = [
    {id: 'c1', title: 'Constraints and the small room', noteCount: 2, createdAt: at('06-20'), updatedAt: at('06-24')},
    {id: 'c2', title: 'Morning ritual, second attempt', noteCount: 1, createdAt: at('06-23')},
    {id: 'c3', title: 'What I keep forgetting about the long walk home after the late shift', noteCount: 3,
        createdAt: at('06-18')},
    {id: 'c4', title: 'A walk without the phone', noteCount: 0, createdAt: at('06-02')},
    {id: 'c5', title: 'Why the graph feels honest', noteCount: 2, createdAt: at('05-21')},
]

export const CHAT_MESSAGES: Record<string, ChatMessage[]> = {
    c1: [
        {id: 'm1', role: 'USER', status: 'COMPLETE', content: 'I keep circling back to the idea that constraints make me more creative, not less.'},
        {id: 'm2', role: 'ASSISTANT', status: 'COMPLETE', content: 'A recurring thread in your notes. Link it under **Creative constraint**?'},
        {id: 'm3', role: 'USER', status: 'COMPLETE', content: 'Yes. And remind me why I resisted it before.'},
        {id: 'm4', role: 'ASSISTANT', status: 'COMPLETE', content: 'You worried that a smaller box means a smaller self. Your later notes disagree:\n\n- the first hour as ritual\n- one small room, one task'},
    ],
    // the latest reply failed, so the chat offers Retry
    c2: [
        {id: 'r1', turnId: 'turn-r1', role: 'USER', status: 'COMPLETE', content: 'Why does the second attempt feel easier?'},
        {id: 'r2', turnId: 'turn-r1', role: 'ASSISTANT', status: 'FAILED', content: ''},
    ],
}

export const NOTES: Note[] = [
    {id: 'n1', source: 'CHAT_SUMMARY', status: 'READY', title: 'The empty room', createdAt: at('06-24'), version: 1,
        updatedAt: at('06-24'),
        content: '## Constraints as a frame\n\nConstraints make me more creative, not less. A smaller room is not a smaller self.\n\n- The first hour is ritual\n- One room, one task'},
    {id: 'n2', source: 'CHAT_SUMMARY', status: 'READY', title: 'A grammar for mornings', createdAt: at('06-23'), version: 1,
        content: 'If the first hour is ritual, the day has a spine to hang on.'},
    {id: 'n3', source: 'CHAT_SUMMARY', status: 'READY',
        title: 'Notes on forgetting, and why I trust the graph to remember the long thread for me', createdAt: at('06-12'),
        content: 'I trust the graph to remember so I am free to lose the thread.'},
    {id: 'n4', source: 'CHAT_SUMMARY', status: 'READY', title: 'Why I resisted it', createdAt: at('05-15'),
        content: 'Old fear: a smaller box means a smaller self. Untrue, mostly.'},
    {id: 'failed', source: 'CHAT_SUMMARY', status: 'FAILED', content: null, createdAt: at('05-02')},
]

/** A stored constellation as the note service keeps it: a root has a hue, a sub-constellation a lightness. */
export interface StoredConstellation {
    id: string
    parentId: string | null
    name: string
    hue: number | null
    lightness: 'DEEP' | 'BASE' | 'LIGHT' | 'PALE' | null
}

export const CONSTELLATIONS: StoredConstellation[] = [
    {id: 'k-music', parentId: null, name: 'Music', hue: 264, lightness: null},
    {id: 'k-jazz', parentId: 'k-music', name: 'Jazz', hue: null, lightness: 'LIGHT'},
    {id: 'k-miles', parentId: 'k-jazz', name: 'Miles', hue: null, lightness: 'PALE'},
    {id: 'k-ambient', parentId: 'k-music', name: 'Ambient', hue: null, lightness: 'LIGHT'},
    {id: 'k-films', parentId: null, name: 'Films', hue: 22, lightness: null},
    {id: 'k-noir', parentId: 'k-films', name: 'Noir', hue: null, lightness: 'DEEP'},
    {id: 'k-fear', parentId: null, name: 'Fear', hue: 152, lightness: null},
]
