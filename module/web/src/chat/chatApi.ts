/**
 * Client for the note-service chat endpoints (`/note/chats`). Uses `authFetch` so JWT +
 * proactive/reactive refresh are handled centrally (see auth/apiClient.ts). Streaming replies are
 * handled separately by `streamChatReply.ts` (SSE, not JSON).
 */
import {authFetch} from '../auth/apiClient'

export type ChatMessageRole = 'USER' | 'ASSISTANT'
export type ChatMessageStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED'

export type Chat = {
    id: string
    title: string
    createdAt?: string
    updatedAt?: string
}

export type ChatMessage = {
    id: string
    role: ChatMessageRole
    status: ChatMessageStatus
    content: string
    createdAt?: string
}

const chatListListeners = new Set<() => void>()

/** Subscribe persistent chat-list consumers to mutations made by this client. */
export function subscribeToChatListChanges(listener: () => void): () => void {
    chatListListeners.add(listener)
    return () => chatListListeners.delete(listener)
}

/** Re-fetch chat-list views after a mutation that can change membership, title, or order. */
export function notifyChatListChanged() {
    chatListListeners.forEach((listener) => listener())
}

export async function listChats(): Promise<Chat[]> {
    const res = await authFetch('/note/chats')
    if (!res.ok) throw new Error(`chat list fetch failed (${res.status})`)
    return (await res.json()) as Chat[]
}

export async function createChat(title?: string): Promise<Chat> {
    const res = await authFetch('/note/chats', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(title ? {title} : {}),
    })
    if (!res.ok) throw new Error(`chat create failed (${res.status})`)
    const chat = (await res.json()) as Chat
    notifyChatListChanged()
    return chat
}

export async function getMessages(chatId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
    const res = await authFetch(`/note/chats/${chatId}/messages`, {signal})
    if (!res.ok) throw new Error(`chat messages fetch failed (${res.status})`)
    return (await res.json()) as ChatMessage[]
}

/** Synchronous (non-streaming) reply — the streaming endpoint (`streamChatReply.ts`) drives the UI. */
export async function sendMessage(chatId: string, content: string): Promise<ChatMessage> {
    const res = await authFetch(`/note/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content}),
    })
    if (!res.ok) throw new Error(`chat send failed (${res.status})`)
    return (await res.json()) as ChatMessage
}
