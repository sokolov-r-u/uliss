The place-picker over the constellation tree: search, rows indented by depth, the ancestors' path under each name.

```jsx
<ConstellationPicker
  items={flat.map((n) => ({id: n.id, name: n.name, depth: n.depth, path: n.path, color: constellationColor(n.hue, n.lightness), count: n.count}))}
  exclude={[branch.id, ...descendantsOf(branch.id)]}
  lead={{label: 'Make it a root', onSelect: () => move(branch.id, null)}}
  onPick={(id) => move(branch.id, id)}
  onClose={close} />
```

- One picker for every "where does this go" question: moving a branch, placing a note, Summarize. Never a `Select`.
- `items` come in tree order (parents before children); search matches the name or any ancestor name, so typing
  "music" keeps the whole Music branch.
- `exclude` removes rows that cannot be picked — a moving branch and all of its descendants. Never grey them out.
- `lead` is an action above the hits ("Make it a root"); it hides while the user searches.
- `onCreate` adds "Create “…”" when no constellation has exactly the typed name (case-insensitive). Leave it out where
  creating makes no sense (moving a branch).
- It is an inline block with a hard edge; the host decides where it sits. Escape in the field calls `onClose`.
- Every row is a native button; the search field is labelled by `label` (default "Search the tree").
