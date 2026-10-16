import type {Chat, ChatMessage} from '../src/chat/chatApi'
import type {Note} from '../src/notes/noteApi'
import type {SkyGraphModel} from '../src/views/models'

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

export const SKY: SkyGraphModel = {
    nodes: [
        {id: 'you', label: 'You', x: 500, y: 350, radius: 10, kind: 'you'},
        {
            id: 'creative',
            label: 'Creative constraint',
            x: 300,
            y: 210,
            radius: 8,
            color: '#d99a4e',
            kind: 'constellation'
        },
        {id: 'attention', label: 'Attention', x: 730, y: 240, radius: 8, color: '#5c8a72', kind: 'constellation'},
        {id: 'n142', label: 'The empty room', x: 180, y: 120, radius: 5, kind: 'note'},
        {id: 'n141', label: 'A grammar for mornings', x: 260, y: 390, radius: 5, kind: 'note'},
        {id: 'n139', label: 'Notes on forgetting', x: 820, y: 150, radius: 5, kind: 'note'},
        {id: 'n137', label: 'Why I resisted it', x: 760, y: 470, radius: 5, kind: 'note'},
    ],
    edges: [
        {from: 'you', to: 'creative'}, {from: 'you', to: 'attention'},
        {from: 'creative', to: 'n142'}, {from: 'creative', to: 'n141'},
        {from: 'attention', to: 'n139'}, {from: 'attention', to: 'n137'},
        {from: 'n141', to: 'attention', secondary: true},
    ],
}
