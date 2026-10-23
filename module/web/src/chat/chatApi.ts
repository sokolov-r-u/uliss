/**
 * Client for the note-service chat endpoints (`/note/chats`). Uses `authFetch` so JWT +
 * proactive/reactive refresh are handled centrally (see auth/apiClient.ts). Streaming replies are
 * handled separately by `streamChatReply.ts` (SSE, not JSON).
 */
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {isRecord, segment} from '../lib/apiHelpers'

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

/** The chat's current summary note and the last message it covers; only on the latest page. */
export type ChatSummaryState = {
    throughMessageId?: string | null
    noteId: string
    noteTitle?: string | null
    noteIcon?: string | null
}

export type ChatMessagePage = {
    messages: ChatMessage[]
    nextCursor: string | null
    hasMore: boolean
    summary?: ChatSummaryState | null
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
    const res = await send('/note/chats')
    await requireOk(res, 'chat list fetch')
    return sortByActivity(parseList(await readJson(res), parseChat))
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

/**
 * A failed chat request: `http` with the status (callers word 404/409 for the user), `transport` when the service was
 * unreachable, `protocol` when its answer was not the expected shape.
 */
export class ChatApiError extends Error {
    constructor(
        message: string,
        public readonly status: number | undefined,
        public readonly kind: 'http' | 'transport' | 'protocol' = 'http',
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = 'ChatApiError'
    }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
    try {
        return await authFetch(path, init)
    } catch (error) {
        if (error instanceof AuthRequiredError || (error instanceof DOMException && error.name === 'AbortError')) throw error
        throw new ChatApiError('chat service is unavailable', undefined, 'transport', {cause: error})
    }
}

async function requireOk(res: Response, operation: string): Promise<void> {
    if (!res.ok) throw new ChatApiError(`${operation} failed (${res.status})`, res.status)
}

async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json()
    } catch (error) {
        throw new ChatApiError('chat service returned invalid JSON', undefined, 'protocol', {cause: error})
    }
}

function protocol(field: string): ChatApiError {
    return new ChatApiError(`invalid ${field} in chat response`, undefined, 'protocol')
}

function text(value: unknown, field: string): string {
    if (typeof value !== 'string') throw protocol(field)
    return value
}

function optionalText(value: unknown, field: string): string | undefined {
    return value == null ? undefined : text(value, field)
}

function parseList<T>(value: unknown, parse: (item: unknown) => T): T[] {
    if (!Array.isArray(value)) throw protocol('list')
    return value.map(parse)
}

function parseChat(value: unknown): Chat {
    if (!isRecord(value)) throw protocol('chat')
    if (typeof value.noteCount !== 'number') throw protocol('noteCount')
    return {
        id: text(value.id, 'id'),
        title: text(value.title, 'title'),
        noteCount: value.noteCount,
        createdAt: optionalText(value.createdAt, 'createdAt'),
        updatedAt: optionalText(value.updatedAt, 'updatedAt'),
    }
}

const ROLES: readonly ChatMessageRole[] = ['USER', 'ASSISTANT']
const STATUSES: readonly ChatMessageStatus[] = ['COMPLETE', 'PARTIAL', 'FAILED', 'CANCELED']

function parseMessage(value: unknown): ChatMessage {
    if (!isRecord(value)) throw protocol('message')
    if (!ROLES.includes(value.role as ChatMessageRole)) throw protocol('role')
    if (!STATUSES.includes(value.status as ChatMessageStatus)) throw protocol('status')
    return {
        id: text(value.id, 'id'),
        turnId: optionalText(value.turnId, 'turnId'),
        role: value.role as ChatMessageRole,
        status: value.status as ChatMessageStatus,
        content: text(value.content, 'content'),
        createdAt: optionalText(value.createdAt, 'createdAt'),
    }
}

// absent off the latest page, null on it when the chat has no summary yet
function parseSummaryState(value: unknown): ChatSummaryState | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null
    if (!isRecord(value)) throw protocol('summary')
    return {
        noteId: text(value.noteId, 'summary noteId'),
        throughMessageId: optionalText(value.throughMessageId, 'throughMessageId') ?? null,
        noteTitle: optionalText(value.noteTitle, 'noteTitle') ?? null,
        noteIcon: optionalText(value.noteIcon, 'noteIcon') ?? null,
    }
}

function parseMessagePage(value: unknown): ChatMessagePage {
    if (!isRecord(value) || typeof value.hasMore !== 'boolean') throw protocol('message page')
    return {
        messages: parseList(value.messages, parseMessage),
        nextCursor: optionalText(value.nextCursor, 'nextCursor') ?? null,
        hasMore: value.hasMore,
        summary: parseSummaryState(value.summary),
    }
}

export async function getChat(chatId: string, signal?: AbortSignal): Promise<Chat> {
    const res = await send(`/note/chats/${segment(chatId)}`, {signal})
    await requireOk(res, 'chat fetch')
    return parseChat(await readJson(res))
}

/** The chats a note was written from, by last activity; empty for a hand-written note. */
export async function listNoteChats(noteId: string, signal?: AbortSignal): Promise<Chat[]> {
    const res = await send(`/note/notes/${segment(noteId)}/chats`, {signal})
    await requireOk(res, 'note chats fetch')
    return parseList(await readJson(res), parseChat)
}

export async function renameChat(chatId: string, title: string): Promise<Chat> {
    const res = await send(`/note/chats/${segment(chatId)}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title}),
    })
    await requireOk(res, 'chat rename')
    return parseChat(await readJson(res))
}

export async function deleteChat(chatId: string): Promise<void> {
    const res = await send(`/note/chats/${segment(chatId)}`, {method: 'DELETE'})
    await requireOk(res, 'chat delete')
}

export async function getMessages(
    chatId: string,
    {before, limit = 50, signal}: GetMessagesOptions = {},
): Promise<ChatMessagePage> {
    const query = new URLSearchParams({limit: String(limit)})
    if (before) query.set('before', before)
    const res = await send(`/note/chats/${segment(chatId)}/messages?${query}`, {signal})
    await requireOk(res, 'chat messages fetch')
    return parseMessagePage(await readJson(res))
}
