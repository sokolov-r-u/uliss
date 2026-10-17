/** Dictated text joins the draft after a space, or replaces an empty one. */
export function appendDictation(draft: string, text: string): string {
    if (draft.trim() === '') return text
    return /\s$/.test(draft) ? draft + text : `${draft} ${text}`
}
