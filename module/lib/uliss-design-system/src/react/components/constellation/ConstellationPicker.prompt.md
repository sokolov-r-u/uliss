The place-picker over the constellation tree: it opens on the roots, a click selects a branch and unfolds it, and the
action button under the list confirms the selection. Search swaps the tree for flat hits with their path.

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
  the branch and unfolds its children, the chevron only folds and unfolds. The user walks down, never scrolls the
  whole tree.
- `action(name)` labels the confirm button for the selection ("Add to Jazz", "Move to Jazz", "Make Jazz main"); it is
  disabled until something is selected or while `busy`.
- Search matches the name or any ancestor name and shows hits with their path; clearing it brings the tree back,
  unfolded down to the selection.
- `exclude` hides rows that cannot be picked with their subtrees — a moving branch. Never grey them out.
- `lead` is a first row that acts at once ("Make it a root"); it hides while the user searches.
- `onCreate(name, parentId)` adds "+ New in <selected>" under the selection, "+ New constellation" for a root, and
  "Create “…” in <selected>" while searching, unless a sibling already has the name. It resolves to the new id, which
  becomes the selection. Leave it out where creating makes no sense (moving a branch).
- It is an inline block with a hard edge; the host decides where it sits. Escape in the search field calls `onClose`;
  Escape in a name field only cancels that field.
- Every row is a native button; the selected row is `aria-pressed`; the search field is labelled by `label` (default
  "Search the tree").
- `notes` makes notes targets too, where a note can hold the one being placed (Summarize, "Move under a note"): typing
  also calls `notes.search(query, signal)` after a short pause (stale searches are aborted) and lists the hits under the
  constellations with their path; a picked note is confirmed by `notes.action(title)` → `notes.onPick(id)`. With
  `items={[]}` it is a note finder only ("Type to find a note."). Leave it out where only a constellation fits.

```jsx
<ConstellationPicker items={items} action={(name) => `Summarize into ${name}`} onPick={summarizeInto}
  notes={{search: findNotes, action: (title) => `Summarize under ${title}`, onPick: summarizeUnder}} />
```
