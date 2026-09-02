Confirmation before anything irreversible.

```jsx
<Dialog title="Summarize this chat?"
  body="Uliss will fold the conversation into a note — the one linked here, or a new one if there is none yet."
  confirm="Summarize" cancel="Not now" />

<Dialog danger title="Delete “The empty room”?"
  body="The note goes. The chats it came from stay, and so do its constellations."
  confirm="Delete" cancel="Keep" />
```

- Confirm label repeats the verb ("Summarize", "Delete"), never "OK" or "Yes".
- The body must name what survives. Uliss owns a lot of the user's material; silence about consequences is the one
  unforgivable copy failure here.
- `danger` = terracotta text. No red, no filled destructive button.
- The overlay is an `aria-modal` dialog labelled by its title. On mount it focuses the first action, traps
  Tab/Shift+Tab,
  closes on Escape or backdrop activation, and restores the previously focused control on unmount.
