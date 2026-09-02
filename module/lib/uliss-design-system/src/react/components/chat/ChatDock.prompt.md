The composer at the foot of a chat.

```jsx
<ChatDock placeholder="Write a thought…" value={draft} onChange={onChange} onSubmit={onSubmit} voiceDisabled>
  <ActionChip label="Update" />
</ChatDock>
```

- `flex: '0 0 auto'` — it never scrolls with the transcript.
- The mic tile is `--bg-muted` with an `--accent-2` glyph: present, not shouting.
- Placeholder is an invitation in sentence case with an ellipsis, never "Type a message".
- The dock is a native form with a controlled text input and separate submit/mic buttons. `disabled` blocks the
  composer;
  `voiceDisabled` honestly disables voice without simulating a recording state. Tab order is input → mic → send.
