The composer at the foot of a chat.

```jsx
<ChatDock placeholder="Write a thought…" value={draft} onChange={onChange} onSubmit={onSubmit} voiceDisabled>
  <ActionChip label="Update" />
</ChatDock>
```

- `flex: '0 0 auto'` — it never scrolls with the transcript.
- The mic tile is `--bg-muted` with an `--accent-2` glyph: present, not shouting.
- Placeholder is an invitation in sentence case with an ellipsis, never "Type a message".
- The dock is a native form with a controlled multiline textarea and separate submit/mic buttons. The textarea wraps
  text at word boundaries and grows from one line up to 144px; content beyond that height scrolls inside the field.
  Enter submits, Shift+Enter inserts a line break, and IME composition never submits. `disabled` blocks the composer;
  `voiceDisabled` honestly disables voice without simulating a recording state. Tab order is textarea → mic → send.
- During an active generation, set `generationActive` and `onStop`. The input and mic are disabled and the submit tile
  is replaced by a native `Stop generation` button; tab order ends on Stop.
