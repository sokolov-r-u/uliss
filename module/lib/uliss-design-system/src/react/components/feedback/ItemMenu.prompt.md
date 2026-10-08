The Rename · Delete menu for one chat or note. Anchored to the dots button (or the long-pressed row) on every
breakpoint — no bottom sheet.

```jsx
<ItemMenu anchor={dotsButton} label="Actions for The empty room" onClose={close}
          actions={[{label: 'Rename', onSelect: rename}, {label: 'Delete', danger: true, onSelect: remove}]}/>
```

- Two items in this order: Rename, Delete. Delete is `danger` (terracotta text, divider above).
- Each item opens a dialog; nothing irreversible happens from the menu itself.
- 196px wide, 48px items; flips upward when the space below is short; stays inside an 8px viewport edge.
- `role="menu"`; focuses the first enabled item, ArrowUp/ArrowDown move, Escape and backdrop close, and focus returns
  to the anchor.
- `disabled` greys an action that is temporarily unavailable, e.g. Delete while a reply is streaming.
