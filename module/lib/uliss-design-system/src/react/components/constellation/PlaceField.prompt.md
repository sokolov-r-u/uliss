A place as one collapsed line under a form's other fields: it shows the chosen path or a placeholder, and a click
opens the `ConstellationPicker` in a large sheet of its own. Only the Summarize dialog uses it; everywhere else the
picker sits inline.

```jsx
<PlaceField label="Place" placeholder="Choose a place" value={place ? pathOf(place) : null}
  onClear={() => setPlace(null)}>
  {(close) => <ConstellationPicker fill items={items} action={(name) => `Choose ${name}`} onClose={close}
    onPick={(id) => { setPlace({constellationId: id}); close() }}
    notes={{items: notes, action: (title) => `Choose ${title}`, onPick: (id) => { setPlace({parentNoteId: id}); close() }}} />}
</PlaceField>
```

- 48px, like `TextField`, with the label above it. `value` is the path as the user reads it ("Music › Jazz"); the host
  builds it. An empty place is a valid answer the host must accept (a note without a constellation).
- The sheet is a modal over the whole page (a portal over a scrim): 640px wide and up to 80% of the window high on a
  desktop, the whole screen on a phone. Give the picker `fill` so its tree takes the sheet's height. A host dialog
  keeps its size and never clips it.
- A pick calls `close`: the sheet closes and the line gets the focus back. Escape and a click on the backdrop do the
  same; Escape never reaches a host dialog. The sheet keeps the focus inside while open.
- `onClear` adds a clear button while there is a value. `disabled` keeps it shut (and closes an open sheet).
- The picker's own confirm button picks; the host's primary action (Summarize) stays outside the field.
