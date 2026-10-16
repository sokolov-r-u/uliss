/**
 * Test-only stand-in for `src/auth/apiClient.ts` (swapped in by `visual/vite.config.ts`): `authFetch` answers from
 * fixtures by URL, so the harness renders the real `App`. `?data=empty` serves a day-one account;
 * `?onboarding=name|profile` serves pending onboarding steps.
 */
import {CHAT_MESSAGES, CHATS, NOTES} from './fixtures'

export class AuthRequiredError extends Error {
    constructor() {
        super('authentication required')
        this.name = 'AuthRequiredError'
    }
}

const params = new URLSearchParams(location.search)
const empty = params.get('data') === 'empty'

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

function onboarding() {
    const step = params.get('onboarding')
    if (step === 'name') return [{code: 'SET_DISPLAY_NAME', blocking: true, status: 'PENDING'}]
    if (step === 'profile') return [{code: 'COMPLETE_PROFILE', blocking: true, status: 'PENDING'}]
    return []
}

/** The harness session never changes: nothing to refresh and no onboarding refusals. */
export async function refreshSession(): Promise<void> {
}

export function onOnboardingRequired(_listener: () => void): () => void {
    return () => undefined
}

export function tokenRequiresOnboarding(): boolean {
    return false
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(path, location.origin)
    const method = init?.method ?? 'GET'
    const chats = empty ? [] : CHATS
    const notes = empty ? [] : NOTES

    if (url.pathname === '/user/users/me/onboarding') return method === 'GET' ? json(onboarding()) : json({})
    if (url.pathname === '/note/chats') return json(chats)
    if (url.pathname === '/note/notes') return json(notes)

    const chatMessages = url.pathname.match(/^\/note\/chats\/([^/]+)\/messages$/)
    if (chatMessages) return json({messages: CHAT_MESSAGES[chatMessages[1]] ?? [], nextCursor: null, hasMore: false})

    const chat = url.pathname.match(/^\/note\/chats\/([^/]+)$/)
    if (chat) {
        const found = chats.find((item) => item.id === chat[1])
        return found ? json(found) : json({}, 404)
    }

    const note = url.pathname.match(/^\/note\/notes\/([^/]+)$/)
    if (note) {
        if (note[1] === 'error') return json({}, 500)
        const found = NOTES.find((item) => item.id === note[1])
        return found ? json(found) : json({}, 404)
    }
    return json({}, 404)
}
