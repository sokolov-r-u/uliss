import type {ConstellationLightness} from '@uliss/design-system'
import {authFetch, AuthRequiredError} from '../auth/apiClient'
import {errorCode, isRecord, segment} from '../lib/apiHelpers'

/** One node of the user's tree as the note service returns it; `hue` is the root's, a root's lightness is `BASE`. */
export interface Constellation {
    id: string
    parentId: string | null
    name: string
    hue: number
    lightness: ConstellationLightness
    /** Distinct notes of the whole subtree. */
    noteCount: number
    /** Notes of the constellation itself. */
    ownNoteCount: number
}

/** One constellation of a note; the service lists the main one first. */
export interface NoteMembership {
    constellationId: string
    main: boolean
}

/** A note named in a path: a parent note of a place or of a search hit. */
export interface NoteRef {
    id: string
    /** Absent for a note still being written. */
    title?: string
    /** The note's emoji; absent for none. */
    icon?: string
}

/** Where a note lives: parent notes from the top one down, and the top note's constellations, main first. */
export interface NotePlace {
    ancestors: NoteRef[]
    constellations: NoteMembership[]
}

/** A star of the sky; [memberships] are set only on a star with no parent star, main first. */
export interface SkyStar {
    id: string
    title: string
    /** The note's emoji; absent for none. */
    icon?: string
    parentNoteId: string | null
    createdAt: string
    memberships: NoteMembership[]
}

/** The whole sky read at one moment: the constellation tree and the stars, oldest first. */
export interface Sky {
    constellations: Constellation[]
    notes: SkyStar[]
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


function protocolError(field: string): ConstellationApiError {
    return new ConstellationApiError('protocol', `invalid ${field} in constellation response`)
}

function parseConstellation(value: unknown): Constellation {
    if (!isRecord(value)) throw protocolError('body')
    const {id, parentId, name, hue, lightness, noteCount, ownNoteCount} = value
    if (typeof id !== 'string' || id === '') throw protocolError('id')
    if (parentId != null && typeof parentId !== 'string') throw protocolError('parentId')
    if (typeof name !== 'string' || name === '') throw protocolError('name')
    if (typeof hue !== 'number' || !Number.isInteger(hue) || hue < 0 || hue > 359) throw protocolError('hue')
    if (!LIGHTNESS.includes(lightness as ConstellationLightness)) throw protocolError('lightness')
    if (!isCount(noteCount)) throw protocolError('noteCount')
    if (!isCount(ownNoteCount) || ownNoteCount > noteCount) throw protocolError('ownNoteCount')
    return {
        id,
        parentId: parentId ?? null,
        name,
        hue,
        lightness: lightness as ConstellationLightness,
        noteCount,
        ownNoteCount,
    }
}

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseMemberships(value: unknown): NoteMembership[] {
    if (!Array.isArray(value)) throw protocolError('membership list')
    const memberships = value.map((item): NoteMembership => {
        if (!isRecord(item) || typeof item.constellationId !== 'string' || item.constellationId === ''
            || typeof item.main !== 'boolean') {
            throw protocolError('membership')
        }
        return {constellationId: item.constellationId, main: item.main}
    })
    if (memberships.length > 0 && memberships.filter((item) => item.main).length !== 1) throw protocolError('main')
    return memberships
}

function parseStar(value: unknown): SkyStar {
    if (!isRecord(value)) throw protocolError('star')
    const {id, title, icon, parentNoteId, createdAt, memberships} = value
    if (typeof id !== 'string' || id === '') throw protocolError('star id')
    if (typeof title !== 'string' || title === '') throw protocolError('star title')
    if (parentNoteId != null && typeof parentNoteId !== 'string') throw protocolError('star parentNoteId')
    if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) throw protocolError('star createdAt')
    if (icon != null && typeof icon !== 'string') throw protocolError('star icon')
    return {
        id, title, ...(icon ? {icon} : {}), parentNoteId: parentNoteId ?? null, createdAt,
        memberships: parseMemberships(memberships),
    }
}

function parseNoteRef(value: unknown): NoteRef {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') throw protocolError('note ref')
    if (value.title != null && typeof value.title !== 'string') throw protocolError('note title')
    if (value.icon != null && typeof value.icon !== 'string') throw protocolError('note icon')
    return {id: value.id, ...(value.title ? {title: value.title} : {}), ...(value.icon ? {icon: value.icon} : {})}
}

function parseRefs(value: unknown): NoteRef[] {
    if (!Array.isArray(value)) throw protocolError('ancestors')
    return value.map(parseNoteRef)
}

function parsePlace(value: unknown): NotePlace {
    if (!isRecord(value)) throw protocolError('place')
    return {ancestors: parseRefs(value.ancestors), constellations: parseMemberships(value.constellations)}
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
    return parseConstellation(await readJson(await send(`/note/constellations/${segment(id)}`, jsonInit('PATCH', patch))))
}

/** Moves the whole branch under [parentId]; null makes it a root. */
export async function moveConstellation(id: string, parentId: string | null): Promise<Constellation> {
    return parseConstellation(await readJson(await send(`/note/constellations/${segment(id)}/move`, jsonInit('POST', {parentId}))))
}

/** How many notes have no place outside the branch, so deleting it has to move them. */
export async function getConstellationDeletion(id: string, signal?: AbortSignal): Promise<{ notesToMove: number }> {
    const value = await readJson(await send(`/note/constellations/${segment(id)}/deletion`, {signal}))
    if (!isRecord(value) || !isCount(value.notesToMove)) throw protocolError('notesToMove')
    return {notesToMove: value.notesToMove}
}

/**
 * Deletes the branch with its sub-constellations. Notes placed only inside it move to [moveTo] as their main place;
 * with null they are left without a constellation. Notes are never deleted.
 */
export async function deleteConstellation(id: string, moveTo: string | null = null): Promise<void> {
    const query = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''
    await send(`/note/constellations/${segment(id)}${query}`, {method: 'DELETE'})
}

/** The note's constellations, main first. */
export async function listNoteConstellations(noteId: string, signal?: AbortSignal): Promise<NoteMembership[]> {
    return parseMemberships(await readJson(await send(`/note/notes/${segment(noteId)}/constellations`, {signal})))
}

/** Adds the note to a constellation; the first one becomes main. Returns the note's constellations. */
export async function addNoteConstellation(noteId: string, constellationId: string): Promise<NoteMembership[]> {
    return parseMemberships(await readJson(await send(`/note/notes/${segment(noteId)}/constellations`,
        jsonInit('POST', {constellationId}))))
}

/** Makes the constellation main; [replace] drops the previous main instead of keeping it in "Also in". */
export async function setMainNoteConstellation(
    noteId: string,
    constellationId: string,
    replace: boolean,
): Promise<NoteMembership[]> {
    return parseMemberships(await readJson(await send(`/note/notes/${segment(noteId)}/constellations/main`,
        jsonInit('PUT', {constellationId, replace}))))
}

/** Removes the note from a constellation; a removed main promotes the oldest remaining one. */
export async function removeNoteConstellation(noteId: string, constellationId: string): Promise<NoteMembership[]> {
    return parseMemberships(await readJson(await send(`/note/notes/${segment(noteId)}/constellations/${segment(constellationId)}`,
        {method: 'DELETE'})))
}

/** Where the note lives; a sub-note's constellations are its top note's. */
export async function getNotePlace(noteId: string, signal?: AbortSignal): Promise<NotePlace> {
    return parsePlace(await readJson(await send(`/note/notes/${segment(noteId)}/place`, {signal})))
}

/**
 * Moves the note under [parentNoteId]: it drops its own constellations and lives where the parent lives. Under itself
 * or its sub-notes fails with code `NOTE_MOVE_CYCLE`, a missing parent with `PARENT_NOTE_NOT_FOUND`.
 */
export async function moveNoteUnder(noteId: string, parentNoteId: string): Promise<NotePlace> {
    return parsePlace(await readJson(await send(`/note/notes/${segment(noteId)}/parent`, jsonInit('PUT', {parentNoteId}))))
}

/** Takes a sub-note out from under its parent: into [moveTo] as its only, main place, or without a place. */
export async function moveNoteOut(noteId: string, moveTo: string | null): Promise<NotePlace> {
    const query = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''
    return parsePlace(await readJson(await send(`/note/notes/${segment(noteId)}/parent${query}`, {method: 'DELETE'})))
}

/** The tree and every star in one snapshot, for the Sky screen. */
export async function getSky(signal?: AbortSignal): Promise<Sky> {
    const value = await readJson(await send('/note/sky', {signal}))
    if (!isRecord(value) || !Array.isArray(value.constellations) || !Array.isArray(value.notes)) {
        throw protocolError('sky')
    }
    return {constellations: value.constellations.map(parseConstellation), notes: value.notes.map(parseStar)}
}
