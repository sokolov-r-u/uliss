import {TbdPage} from '../ui/TbdPage'

export function JournalPage() {
    return (
        <TbdPage
            kicker="journal"
            title="Your journal"
            description="A day-by-day record of your notes, sortable by created or updated. Not built yet —
        note-service doesn't expose a notes-list endpoint yet."
        />
    )
}
