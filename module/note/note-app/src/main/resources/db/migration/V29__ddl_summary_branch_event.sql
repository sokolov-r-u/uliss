-- A note branched from the unsummarized tail of a chat that already has its main note.
ALTER TABLE note.outbox_event
    DROP CONSTRAINT outbox_event_type_check,
    ADD CONSTRAINT outbox_event_type_check
        CHECK (type IN ('NOTE_SUMMARY_REQUESTED', 'NOTE_SUMMARY_UPDATE_REQUESTED', 'NOTE_INDEX_REQUESTED',
                        'NOTE_RESUMMARIZE_REQUESTED', 'USER_PROFILE_REFRESH_REQUESTED',
                        'NOTE_SUMMARY_BRANCH_REQUESTED'));
