import type {ConstellationLightness} from '@uliss/design-system'
import {authFetch, AuthRequiredError} from '../auth/apiClient'

/** One node of the user's tree as the note service returns it; `hue` is the root's, a root's lightness is `BASE`. */
export interface Constellation {
    id: string
    parentId: string | null
    name: string
    hue: number
    lightness: ConstellationLightness
    noteCount: number
}

export interface ConstellationPatch {
    name?: string
    hue?: number
    lightness?: ConstellationLightness
}

export type ConstellationApiFailureKind = 'http' | 'transport' | 'protocol'

export class ConstellationApiError extends Error {
    constructor(
        public readonly kind: ConstellationApiFailureKind,
        message: string,
        public readonly status?: number,
        options?: ErrorOptions,
        /** The service's error code (`CONSTELLATION_NAME_TAKEN`, `CONSTELLATION_MOVE_CYCLE`), when the body carried one. */
        public readonly code?: string,
    ) {
        super(message, options)
        this.name = 'ConstellationApiError'
    }
}

const LIGHTNESS: readonly ConstellationLightness[] = ['DEEP', 'BASE', 'LIGHT', 'PALE']

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function protocolError(field: string): ConstellationApiError {
    return new ConstellationApiError('protocol', `invalid ${field} in constellation response`)
}

function parseConstellation(value: unknown): Constellation {
    if (!isRecord(value)) throw protocolError('body')
    const {id, parentId, name, hue, lightness, noteCount} = value
    if (typeof id !== 'string' || id === '') throw protocolError('id')
    if (parentId != null && typeof parentId !== 'string') throw protocolError('parentId')
    if (typeof name !== 'string' || name === '') throw protocolError('name')
    if (typeof hue !== 'number' || !Number.isInteger(hue) || hue < 0 || hue > 359) throw protocolError('hue')
    if (!LIGHTNESS.includes(lightness as ConstellationLightness)) throw protocolError('lightness')
    if (typeof noteCount !== 'number' || noteCount < 0) throw protocolError('noteCount')
    return {id, parentId: parentId ?? null, name, hue, lightness: lightness as ConstellationLightness, noteCount}
}

async function send(path: string, init?: RequestInit): Promise<Response> {
    let response: Response
    try {
        response = await authFetch(path, init)
    } catch (error) {
        if (error instanceof AuthRequiredError || (error instanceof DOMException && error.name === 'AbortError')) {
            throw error
        }
        throw new ConstellationApiError('transport', 'note service is unavailable', undefined, {cause: error})
    }
    if (!response.ok) {
        throw new ConstellationApiError('http', `constellation request failed (${response.status})`, response.status,
            undefined, await errorCode(response))
    }
    return response
}

/** The `code` of the service's error body; undefined for an empty or non-JSON body (a proxy error page). */
async function errorCode(response: Response): Promise<string | undefined> {
    try {
        const body: unknown = await response.json()
        return isRecord(body) && typeof body.code === 'string' ? body.code : undefined
    } catch {
        return undefined
    }
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch (error) {
        throw new ConstellationApiError('protocol', 'note service returned invalid JSON', undefined, {cause: error})
    }
}

function jsonInit(method: string, body: unknown): RequestInit {
    return {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}
}

/** The user's whole tree, flat; `buildConstellationTree` turns it into a tree. */
export async function listConstellations(signal?: AbortSignal): Promise<Constellation[]> {
    const value = await readJson(await send('/note/constellations', {signal}))
    if (!Array.isArray(value)) throw protocolError('list')
    return value.map(parseConstellation)
}

/** A root when [parentId] is null. */
export async function createConstellation(name: string, parentId: string | null): Promise<Constellation> {
    return parseConstellation(await readJson(await send('/note/constellations', jsonInit('POST', {name, parentId}))))
}

export async function updateConstellation(id: string, patch: ConstellationPatch): Promise<Constellation> {
    return parseConstellation(await readJson(await send(`/note/constellations/${id}`, jsonInit('PATCH', patch))))
}

/** Moves the whole branch under [parentId]; null makes it a root. */
export async function moveConstellation(id: string, parentId: string | null): Promise<Constellation> {
    return parseConstellation(await readJson(await send(`/note/constellations/${id}/move`, jsonInit('POST', {parentId}))))
}

/** Deletes the branch with its sub-constellations. */
export async function deleteConstellation(id: string): Promise<void> {
    await send(`/note/constellations/${id}`, {method: 'DELETE'})
}
