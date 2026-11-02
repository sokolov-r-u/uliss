-- The user profile reads new notes through its own outbox event.
ALTER TABLE note.outbox_event
    DROP CONSTRAINT outbox_event_type_check,
    ADD CONSTRAINT outbox_event_type_check
        CHECK (type IN ('NOTE_SUMMARY_REQUESTED', 'NOTE_SUMMARY_UPDATE_REQUESTED', 'NOTE_INDEX_REQUESTED',
                        'NOTE_RESUMMARIZE_REQUESTED', 'USER_PROFILE_REFRESH_REQUESTED'));
