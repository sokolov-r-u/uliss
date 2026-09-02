export interface NoteViewModel {
    id: string
    ordinal: number
    title: string
    excerpt: string
    date: string
    linkCount: number
    unread?: boolean
}

export interface SearchChatViewModel {
    id: string
    title: string
    date: string
    noteCount: number
}

export interface SearchViewModel {
    totalNotes: number
    notes: NoteViewModel[]
    chats: SearchChatViewModel[]
}

export interface ConstellationTreeNode {
    id: string
    label: string
    count: number
    hue: number
    lightness?: number
    children?: ConstellationTreeNode[]
    notes?: NoteViewModel[]
}

export interface SkyGraphNode {
    id: string
    label: string
    x: number
    y: number
    radius: number
    color?: string
    kind: 'you' | 'constellation' | 'note'
}

export interface SkyGraphEdge {
    from: string
    to: string
    secondary?: boolean
}

export interface SkyGraphModel {
    nodes: SkyGraphNode[]
    edges: SkyGraphEdge[]
}

export interface UpdateViewModel {
    id: string
    category: 'link' | 'note' | 'pattern'
    title: string
    detail: string
    date: string
    undoable?: boolean
    pending?: boolean
}

export interface UpdateDecisionViewModel {
    id: string
    title: string
    detail: string
    confirmLabel: string
}
