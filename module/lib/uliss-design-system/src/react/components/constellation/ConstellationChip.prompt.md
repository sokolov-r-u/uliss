A secondary constellation membership — dot plus name, no box.

```jsx
{note.secondary.map((t) => (
  <ConstellationChip key={t.id} label={t.label} color={colorFor(t)} onRemove={() => remove(t.id)} />
))}
```

- Never draw it as a filled pill or a bordered tag.
- The dominant constellation is not a chip — render it as an accent breadcrumb trail (`root › … › leaf`) that collapses
  middle links to an ellipsis when the line is too long.
- The label action and optional remove action are separate native buttons; they are never nested or implemented with
  clickable spans. The remove button is named `Remove <label>` and both actions retain native focus/keyboard behavior.
