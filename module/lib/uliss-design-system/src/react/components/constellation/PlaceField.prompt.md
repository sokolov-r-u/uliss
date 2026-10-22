A place as one collapsed line under a form's other fields: it shows the chosen path or a placeholder, and a click asks
the host to show the `ConstellationPicker`. In a `Notice` the picker is the notice's own next step (`step`): same card,
same size, same star. Only the Summarize dialog uses it; everywhere else the picker sits inline.

```jsx
<Notice title="Create a summary note?" primary="Summarize" onPrimary={summarize}
  step={picking ? {title: 'Choose a place', onBack: () => setPicking(false), children:
    <ConstellationPicker fill items={items} action={(name) => `Put in ${name}`}
      onPick={(id) => { setPlace({constellationId: id}); setPicking(false) }} />} : undefined}>
  <PlaceField label="Place" value={place ? pathOf(place) : null} open={picking} onOpen={() => setPicking(true)}
    onClear={() => setPlace(null)} />
</Notice>
```

- 48px, like `TextField`, with the label above it and a chevron pointing on to the next step. `value` is the path as
  the user reads it ("Music › Jazz"); the host builds it. An empty place is a valid answer the host must accept (a note
  without a constellation).
- `open` tells the line that the host shows the picker; when it turns false the line takes the focus back.
- `onClear` adds a clear button while there is a value. `disabled` keeps both shut.
- Never a dropdown or a second window over the dialog: the picker replaces the dialog's content in place.
