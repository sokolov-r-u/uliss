The in-content offer — 26px, accent border, glyph first.

```jsx
<ActionChip label="Update" icon="summary" onClick={confirm} />
```

Centred above the chat dock. Copy is a verb Uliss performs ("Summarize", "Update"), and it always opens a confirmation
before doing anything irreversible.

It is a native button, defaults to `type="button"`, and accepts standard button/ARIA attributes. `disabled` removes
activation; focus and Enter/Space behavior stay native.
