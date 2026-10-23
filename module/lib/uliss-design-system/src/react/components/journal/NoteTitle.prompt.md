A note's name as the user sees it: emoji, space, name. Use it wherever a note's name is shown.

```jsx
<ListRow title={note.title} icon={note.icon ?? null} date="Jun 22" onClick={open} />
<h1><NoteTitle title={note.title} icon={note.icon} /></h1>
<span><NoteTitle title={note.title} icon={note.icon} slot /></span>
const label = `Actions for ${noteTitleText(note.title, note.icon)}`
```

- In lists (`slot`) a note without an emoji keeps an empty slot of the same width, so all names start at one line.
  `ListRow` does it with `icon` (null keeps the slot; leave `icon` out for chats), `ConstellationPicker` for its notes.
- Alone — a heading, a breadcrumb, a single label — a note without an emoji is just its name, no gap.
- `noteTitleText(title, icon)` spells "🎷 Giant Steps" for accessible names, confirm buttons, paths and canvas labels.
- Only notes have emoji; chats and constellations never do.
