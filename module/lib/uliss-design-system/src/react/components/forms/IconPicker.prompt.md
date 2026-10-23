A note's emoji: a 48px square next to the note's name field. It shows the emoji, or a faint plus while there is none.
The full Unicode set with search, favorites and skin tones comes from `EmojiPicker`, which it opens under itself.

```jsx
<div style={{display: 'flex', alignItems: 'flex-end', gap: 8}}>
  <IconPicker label="Icon" value={icon} onChange={setIcon} dataSource="/emoji/en/data.json" />
  <div style={{flex: 1}}>
    <TextField label="Name" value={name} limit={50} onChange={(event) => setName(event.target.value)} />
  </div>
</div>
```

- Bottom-aligned with the name field's input (`alignItems: 'flex-end'`); it has no label row of its own. Its name reads
  "Icon: 🎷" or "Icon: none".
- The picker opens under the square, above it when the room below is short; it always stays inside the window, over
  the square itself in a window too low for either side. A pick or "Remove the icon" closes it and returns the focus; Escape, a click outside or a second
  click close it without a change. Its Escape is marked handled, so a host dialog stays open.
- It is portalled into the nearest element marked `data-popover-root` (`POPOVER_ROOT_ATTRIBUTE`) or into the page. A
  dialog overlay marks its content with it, so the picker stays inside the dialog's focus trap and the card neither
  clips it nor changes size.
- In a `Notice` pass `cover`: the picker lies over the card in its place and size, titled "Choose an icon" with a
  close button, so one card stands in for the other until the pick; the favorites keep three rows and the grid takes
  the rest. In a page leave it out: the dropdown hangs under the square.
- The emoji never enters the name: the name's counter and rules ignore it.
