A note's emoji: a 48px square next to the note's name field. It shows the emoji, or a faint plus while there is none.
The full Unicode set with search, favorites and skin tones comes from `EmojiPicker`.

```jsx
<div style={{display: 'flex', alignItems: 'flex-end', gap: 8}}>
  <IconPicker label="Icon" value={icon} onChange={setIcon} dataSource="/emoji/en/data.json" />
  <div style={{flex: 1}}>
    <TextField label="Name" value={name} limit={50} onChange={(event) => setName(event.target.value)} />
  </div>
</div>
```

In a `Notice` the picker is the notice's own next step, like `PlaceField`'s picker — same card, same size:

```jsx
<Notice title="Create a summary note?" primary="Summarize" onPrimary={summarize}
  step={choosingIcon ? {title: 'Choose an icon', onBack: () => setChoosingIcon(false), children:
    <EmojiPicker fill dataSource="/emoji/en/data.json"
      onPick={(emoji) => { setIcon(emoji); setChoosingIcon(false) }}
      onRemove={icon ? () => { setIcon(null); setChoosingIcon(false) } : undefined} />} : undefined}>
  <IconPicker label="Icon" value={icon} open={choosingIcon} onOpen={() => setChoosingIcon(true)}
    dataSource="/emoji/en/data.json" />
</Notice>
```

- Bottom-aligned with the name field's input (`alignItems: 'flex-end'`); it has no label row of its own. Its name reads
  "Icon: 🎷" or "Icon: none".
- With `onChange` it opens its own picker under itself (320 × 380, above page menus). A pick or "Remove the icon"
  closes it and returns the focus; Escape, a click outside or a second click close it without a change. Its Escape is
  marked handled, so a host dialog stays open.
- With `open` + `onOpen` it only asks the host to show the picker and takes the focus back when `open` turns false.
  Use this inside a `Notice`: never a dropdown or a second window over a dialog.
- The emoji never enters the name: the name's counter and rules ignore it.
