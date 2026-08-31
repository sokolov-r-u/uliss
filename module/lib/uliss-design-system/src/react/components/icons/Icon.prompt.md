Every icon in Uliss — one component, a name, a size; inherits `currentColor`.

```jsx
<span style={{ color: 'var(--accent-2)', display: 'flex' }}>
  <Icon name="star" size={13} />
</span>
```

- **Colour comes from the parent.** Icons never carry their own colour: wrap in a span with `color: var(--accent-2)` (
  active / bright), `var(--text-muted)` (inactive), `var(--cream-dim)` (chrome).
- **Sizes in use:** 12–13px inline with text (meta rows, chips), 15–18px in chrome and nav, `size * 0.34` inside
  `MicButton`.
- `rotate={-90}` turns `chevron` into a right-pointing disclosure; `rotate={180}` collapses it.
- `mic` takes `fill` — outline when idle, filled while recording.
- Never introduce a glyph outside `ICON_NAMES` without adding it here first.
