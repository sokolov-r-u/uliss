One line of hint, progress or error under a control, with its height reserved so the layout never jumps.

```jsx
<TextField label="Image link" value={url} onChange={onChange} aria-describedby="poster-message" />
<FieldMessage id="poster-message" text="Too small: 120 × 180 px, needs at least 300 px" tone="error" />
```

- `tone`: `hint` (--text-faint), `busy` (--text-muted), `ok` (--cream-dim, ✓), `error` (--terracotta, !). An error is
  `role="alert"`, the others `role="status"`; all are polite live regions.
- `lines` (default 2) reserves `lines × 16px` whatever the text: size it for the longest message at the narrowest width,
  and shorten a text that does not fit rather than letting the block grow.
- The text is data, not a blurb: an error says what is wrong and, when there is one, the fix.
- It does not style the field: TextField has no error state.
