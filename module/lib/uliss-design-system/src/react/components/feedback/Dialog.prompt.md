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
- Agreed exception: deleting a note shows no body. The note is the only thing that goes, and the chats it came from
  are never touched.
- `children` holds the one field a confirmation asks through — Rename is `Dialog` + `TextField`, never a `Notice`:

```jsx
<Dialog title="Rename note" confirm="Save" cancel="Cancel" confirmDisabled={!title.trim()} onConfirm={save} onCancel={close}>
  <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={50} />
</Dialog>
```

- `confirmDisabled` greys the confirm action; `busy` sets `aria-busy` while the action runs.
- The overlay is an `aria-modal` dialog labelled by its title. On mount it focuses its `[autofocus]` element or the
  first focusable one (a field in `children` comes before the buttons), traps Tab/Shift+Tab, closes on Escape or
  backdrop activation, and restores the previously focused control on unmount (`useFocusTrap`). A parent re-render
  with a new `onCancel` does not move focus.
