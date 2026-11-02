-- Summarize again: regenerates a READY summary note from its whole chat through the same summary request.
ALTER TABLE note.outbox_event
    DROP CONSTRAINT outbox_event_type_check,
    ADD CONSTRAINT outbox_event_type_check
        CHECK (type IN ('NOTE_SUMMARY_REQUESTED', 'NOTE_SUMMARY_UPDATE_REQUESTED', 'NOTE_INDEX_REQUESTED',
                        'NOTE_RESUMMARIZE_REQUESTED'));
