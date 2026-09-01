The composer at the foot of a chat.

```jsx
<ChatDock placeholder="Write a thought…">
  <ActionChip label="Update" />
</ChatDock>
```

- `flex: '0 0 auto'` — it never scrolls with the transcript.
- The mic tile is `--bg-muted` with an `--accent-2` glyph: present, not shouting.
- Placeholder is an invitation in sentence case with an ellipsis, never "Type a message".
