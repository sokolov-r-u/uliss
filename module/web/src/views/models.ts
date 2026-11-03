export interface NoteViewModel {
    id: string
    ordinal: number
    title: string
    /** The note's emoji; absent or null for none (lists keep its slot). */
    icon?: string | null
    excerpt: string
    date: string
    linkCount: number
    unread?: boolean
    /** False while the note is generating or failed. */
    renamable?: boolean
    /** Raw ISO time the list is ordered by (last change in the note list) — drives the month headings of wide lists. */
    listedAt?: string
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
