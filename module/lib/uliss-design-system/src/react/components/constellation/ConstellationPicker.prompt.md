The place-picker over the constellation tree: it opens on the roots, a click selects a branch and unfolds it, and the
action button under the list confirms the selection. Search stays in the tree: it marks the matches, unfolds the
branches down to them and steps through them.

```jsx
<ConstellationPicker
  items={flat.map((n) => ({id: n.id, parentId: n.parentId, name: n.name, depth: n.depth, path: n.path, color: constellationColor(n.hue, n.lightness), count: n.count}))}
  action={(name) => `Add to ${name}`}
  onPick={(id) => place(note.id, id)}
  onCreate={async (name, parentId) => (await create(name, parentId)).id}
  onClose={close} />

<ConstellationPicker
  items={items}
  exclude={[branch.id, ...descendantsOf(branch.id)]}
  action={(name) => `Move to ${name}`}
  lead={{label: 'Make it a root', onSelect: () => move(branch.id, null)}}
  onPick={(id) => move(branch.id, id)}
  onClose={close} />
```

- One picker for every "where does this go" question: placing a note, moving a branch, Summarize, moving a note under
  a note. Never a `Select`.
- `items` come in tree order (parents before children) with `parentId`. Only roots show at first; a row click selects
  the row and unfolds its children, the chevron only folds and unfolds. The list shows five rows and scrolls beyond; with `fill` it
  takes its host's height instead (a `Notice` step).
- `action(name)` labels the confirm button for the selection ("Add to Jazz", "Move to Jazz", "Make Jazz main"); it is
  disabled until something is selected or while `busy`.
- Search matches a row's own name. The tree stays: matches are marked, the branches down to them unfold while the
  search lasts, and a `2 / 7` counter with ↑/↓ steps through them (Enter / Shift+Enter and the arrow keys in the field
  too, round in a circle); the current match is the selection and scrolls into view. Typing selects the first match;
  with no match the selection from before the search comes back. Clearing the search folds what it opened, except the
  way down to the selection.
- `exclude` hides rows that cannot be picked with their subtrees — a moving branch, a moving note with its sub-notes.
  Never grey them out.
- `lead` is a first row that acts at once ("Make it a root"); it hides while the user searches.
- `onCreate(name, parentId)` adds "+ New in <selected>" under a selected constellation, "+ New constellation" for a
  root, and "Create “…”" while searching — in the selection kept from before the search, at the root when the
  selection is the current match — unless a sibling already has the name. It resolves to the new id, which becomes the
  selection. Leave it out where creating makes no sense (moving a branch).
- It is an inline block with a hard edge; the host decides where it sits. Escape in the search field calls `onClose`;
  Escape in a name field only cancels that field.
- Every row is a native button; the selected row is `aria-pressed`; the search field is labelled by `label` (default
  "Search the tree"). The search field has no focus ring of its own: its bottom edge and icon brighten instead.
- `notes` makes notes targets too, where a note can hold the one being placed (Summarize, "Move under a note").
  `notes.items` is every such note, flat: `parentId` is its parent note, `constellationIds` its constellations. A note
  sits in each of its constellations after their sub-constellations, its sub-notes under it, and notes with no
  constellation of the tree in a last "Without constellation" branch; with `items={[]}` notes are the roots. A picked
  note is confirmed by `notes.action(title)` → `notes.onPick(id)`. Leave it out where only a constellation fits.
- A note's `icon` stands before its title in the tree (`NoteTitle` with its slot, so names align) and in the title
  passed to `notes.action` ("🎷 Giant Steps"); the search reads the title only.

```jsx
<ConstellationPicker items={items} action={(name) => `Summarize into ${name}`} onPick={summarizeInto}
  notes={{items: sky.notes.map((n) => ({id: n.id, title: n.title, icon: n.icon, parentId: n.parentNoteId,
    constellationIds: n.memberships.map((m) => m.constellationId)})),
    action: (title) => `Summarize under ${title}`, onPick: summarizeUnder}} />
```
