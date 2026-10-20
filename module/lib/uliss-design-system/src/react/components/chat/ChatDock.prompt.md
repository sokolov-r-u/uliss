The composer at the foot of a chat.

```jsx
<ChatDock placeholder="Write a thought…" value={draft} onChange={onChange} onSubmit={onSubmit} voiceDisabled>
  <ActionChip label="Update" />
</ChatDock>
```

```jsx
<ChatDock value={draft} onChange={onChange} onSubmit={onSubmit}
          voice={{ state: 'recording', elapsedSeconds: 42, maxSeconds: 300,
                   onStart, onStop, onSend, onRetry }} />
```

- `flex: '0 0 auto'` — it never scrolls with the transcript.
- The mic tile is `--bg-muted` with a `--cream-dim` glyph: present, not shouting. Without `voice` or `onMic` it is
  disabled; during recording Stop and Send follow `disabled` (Send also `generationActive`).
- Placeholder is an invitation in sentence case with an ellipsis, never "Type a message".
- The dock is a native form with a controlled multiline textarea and separate submit/mic buttons. The textarea wraps
  text at word boundaries and grows from one line up to 144px; content beyond that height scrolls inside the field.
  Enter submits, Shift+Enter inserts a line break, and IME composition never submits. `disabled` blocks the composer;
  `voiceDisabled` honestly disables voice without simulating a recording state. Tab order is textarea → mic → send.
- During an active generation, set `generationActive` and `onStop`. The input and mic are disabled and the submit tile
  is replaced by a native `Stop generation` button; tab order ends on Stop.
- Dictation goes through `voice` (it replaces `onMic`); the dock only draws the state, the consumer records and
  transcribes. `recording` swaps the field for a live status — the filled `mic` glyph pulsing on the shared cycle,
  "Recording" and a tabular `0:42 / 5:00` clock — and the tiles for **Stop recording** (text goes into the field) and
  **Send recording** (text is sent at once); the draft stays in the consumer's state and returns with the field.
  `transcribing` locks the field and the tiles while the mic glyph pulses (`aria-busy`). `failed` adds a `retry`
  tile in `--accent-2` before the mic; the mic still starts a fresh recording. Error wording lives outside the dock.
  `voiceDisabled` still means voice is unavailable, never a simulated recording.
