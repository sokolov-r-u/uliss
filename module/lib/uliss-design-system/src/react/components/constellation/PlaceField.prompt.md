A place as one collapsed line under a form's other fields: it shows the chosen path or a placeholder, and a click
unfolds the `ConstellationPicker` under it. Only the Summarize dialog uses it; everywhere else the picker sits inline.

```jsx
<PlaceField label="Place" placeholder="Choose a place" value={place ? pathOf(place) : null}
  onClear={() => setPlace(null)}>
  {(close) => <ConstellationPicker items={items} action={(name) => `Choose ${name}`} onClose={close}
    onPick={(id) => { setPlace({constellationId: id}); close() }}
    notes={{items: notes, action: (title) => `Choose ${title}`, onPick: (id) => { setPlace({parentNoteId: id}); close() }}} />}
</PlaceField>
```

- 48px, like `TextField`, with the label above it. `value` is the path as the user reads it ("Music › Jazz"); the host
  builds it. An empty place is a valid answer the host must accept (a note without a constellation).
- The picker unfolds over what follows (absolutely positioned), so a dialog keeps its size while it opens.
- A pick calls `close`: the line collapses and gets the focus back. Escape does the same and never reaches a host
  dialog. A click outside only collapses it.
- `onClear` adds a clear button while there is a value. `disabled` keeps it shut.
- The picker's own confirm button picks; the host's primary action (Summarize) stays outside the field.
