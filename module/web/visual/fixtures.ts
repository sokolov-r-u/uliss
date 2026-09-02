import type {
    ConstellationTreeNode,
    NoteViewModel,
    SearchViewModel,
    SkyGraphModel,
    UpdateDecisionViewModel,
    UpdateViewModel
} from '../src/views/models'

export const NOTES: NoteViewModel[] = [
    {
        id: '142',
        ordinal: 142,
        title: 'The empty room',
        excerpt: 'Constraints make me more creative, not less. A recurring thread.',
        date: 'Jun 22',
        linkCount: 4,
        unread: true
    },
    {
        id: '141',
        ordinal: 141,
        title: 'A grammar for mornings',
        excerpt: 'If the first hour is ritual, the day has a spine to hang on.',
        date: 'Jun 21',
        linkCount: 2,
        unread: true
    },
    {
        id: '139',
        ordinal: 139,
        title: 'Notes on forgetting',
        excerpt: 'I trust the graph to remember so I am free to lose the thread.',
        date: 'Jun 18',
        linkCount: 6
    },
    {
        id: '137',
        ordinal: 137,
        title: 'Why I resisted it',
        excerpt: 'Every ritual I kept started as something I mocked.',
        date: 'Jun 15',
        linkCount: 1
    },
]

export const SEARCH: SearchViewModel = {
    totalNotes: 142,
    notes: NOTES.slice(0, 3),
    chats: [
        {id: 'chat-1', title: 'Morning ritual, second attempt', date: 'Jun 21', noteCount: 1},
        {id: 'chat-2', title: 'On discipline and rest', date: 'Jun 08', noteCount: 2},
    ],
}

export const CONSTELLATIONS: ConstellationTreeNode[] = [
    {
        id: 'creative', label: 'Creative constraint', count: 34, hue: 36, children: [
            {id: 'writing', label: 'Writing', count: 19, hue: 36, lightness: 0.52, notes: NOTES.slice(0, 2)},
            {
                id: 'music', label: 'Music', count: 15, hue: 36, lightness: 0.72, children: [
                    {id: 'jazz', label: 'Jazz', count: 11, hue: 36, lightness: 0.82, notes: NOTES.slice(1, 4)},
                ]
            },
        ]
    },
    {id: 'attention', label: 'Attention', count: 22, hue: 156, notes: NOTES.slice(2)},
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

export const UPDATES: UpdateViewModel[] = [
    {
        id: 'u1',
        category: 'link',
        title: 'Creative constraint',
        detail: 'Linked four notes into a new constellation.',
        date: 'Jun 22 · 09:12',
        undoable: true
    },
    {
        id: 'u2',
        category: 'note',
        title: 'Evening check-in',
        detail: 'Summarized the conversation into a note.',
        date: 'Jun 22 · 08:40'
    },
    {
        id: 'u3',
        category: 'pattern',
        title: 'Rest returns',
        detail: 'Noticed “rest” recurring in six notes.',
        date: 'Jun 22 · 08:05',
        pending: true
    },
]

export const DECISIONS: UpdateDecisionViewModel[] = [
    {
        id: 'd1',
        title: 'Music has grown to 34 notes. Split out Jazz?',
        detail: 'Eleven notes discuss jazz and nothing else.',
        confirmLabel: 'Split'
    },
    {
        id: 'd2',
        title: 'Merge Morning pages into Writing?',
        detail: 'The branch has not received a new note since Mar 18.',
        confirmLabel: 'Merge'
    },
]
