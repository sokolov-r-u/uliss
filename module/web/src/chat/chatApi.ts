/**
 * Client for the note-service chat endpoints (`/note/chats`). Uses `authFetch` so JWT +
 * proactive/reactive refresh are handled centrally (see auth/apiClient.ts). Streaming replies are
 * handled separately by `streamChatReply.ts` (SSE, not JSON).
 */
import {authFetch} from '../auth/apiClient'

export type ChatMessageRole = 'USER' | 'ASSISTANT'
export type ChatMessageStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'CANCELED'

export type Chat = {
    id: string
    title: string
    /** Notes Uliss wrote from this chat; deleting the chat keeps them. */
    noteCount: number
    createdAt?: string
    updatedAt?: string
}

export type ChatMessage = {
    id: string
    turnId?: string
    role: ChatMessageRole
    status: ChatMessageStatus
    content: string
    createdAt?: string
}

export type ChatMessagePage = {
    messages: ChatMessage[]
    nextCursor: string | null
    hasMore: boolean
}

export type GetMessagesOptions = {
    before?: string
    limit?: number
    signal?: AbortSignal
}

const chatListListeners = new Set<() => void>()

/** Subscribe persistent chat-list consumers to mutations made by this client. */
export function subscribeToChatListChanges(listener: () => void): () => void {
    chatListListeners.add(listener)
    return () => chatListListeners.delete(listener)
}

/** Re-fetch chat-list views after a mutation that can change membership, title, note count, or order. */
export function notifyChatListChanged() {
    chatListListeners.forEach((listener) => listener())
}

export async function listChats(): Promise<Chat[]> {
    const res = await authFetch('/note/chats')
    if (!res.ok) throw new Error(`chat list fetch failed (${res.status})`)
    return sortByActivity((await res.json()) as Chat[])
}

/** Last activity of a chat: `updatedAt`, else `createdAt` — what chat lists sort and group by. */
export function chatActivity(chat: Chat): string | undefined {
    return chat.updatedAt ?? chat.createdAt
}

// The server orders by creation; lists show and group by last activity, newest first.
function sortByActivity(chats: Chat[]): Chat[] {
    const time = (chat: Chat) => {
        const value = Date.parse(chatActivity(chat) ?? '')
        return Number.isNaN(value) ? 0 : value
    }
    return [...chats].sort((a, b) => time(b) - time(a))
}

/** A failed chat request; `status` lets callers word 404/409 for the user. */
export class ChatApiError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message)
        this.name = 'ChatApiError'
    }
}

export async function getChat(chatId: string, signal?: AbortSignal): Promise<Chat> {
    const res = await authFetch(`/note/chats/${chatId}`, {signal})
    if (!res.ok) throw new ChatApiError(`chat fetch failed (${res.status})`, res.status)
    return (await res.json()) as Chat
}

export async function renameChat(chatId: string, title: string): Promise<Chat> {
    const res = await authFetch(`/note/chats/${chatId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title}),
    })
    if (!res.ok) throw new ChatApiError(`chat rename failed (${res.status})`, res.status)
    return (await res.json()) as Chat
}

export async function deleteChat(chatId: string): Promise<void> {
    const res = await authFetch(`/note/chats/${chatId}`, {method: 'DELETE'})
    if (!res.ok) throw new ChatApiError(`chat delete failed (${res.status})`, res.status)
}

export async function getMessages(
    chatId: string,
    {before, limit = 50, signal}: GetMessagesOptions = {},
): Promise<ChatMessagePage> {
    const query = new URLSearchParams({limit: String(limit)})
    if (before) query.set('before', before)
    const res = await authFetch(`/note/chats/${chatId}/messages?${query}`, {signal})
    if (!res.ok) throw new Error(`chat messages fetch failed (${res.status})`)
    return (await res.json()) as ChatMessagePage
}
