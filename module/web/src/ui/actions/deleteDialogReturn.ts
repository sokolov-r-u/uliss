/**
 * A note opened from the chat delete dialog can go back to it. The screen's URL carries the open dialog
 * (`?deleteChat=<chatId>&in=<host>`), so the note's Back button and the browser's back both return to it; the host
 * names which of the chat's action menus on that screen reopens it.
 */
export type DeleteDialogHost = 'nav' | 'list' | 'header'

export const DELETE_CHAT_PARAM = 'deleteChat'
export const DELETE_HOST_PARAM = 'in'

/** History state of a note opened from the dialog. */
export const BACK_TO_DELETE_DIALOG_STATE = {backToDeleteDialog: true} as const

export function isBackToDeleteDialog(state: unknown): boolean {
    return typeof state === 'object' && state !== null && (state as Record<string, unknown>).backToDeleteDialog === true
}

/** The dialog was left for a note from the side navigation: on a phone the drawer must open to show it again. */
export function returnsToNavDialog(search: string): boolean {
    const params = new URLSearchParams(search)
    return params.has(DELETE_CHAT_PARAM) && params.get(DELETE_HOST_PARAM) === 'nav'
}
