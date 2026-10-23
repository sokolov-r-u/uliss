The full Unicode emoji set with search, favorites ("frequently used") and skin tones: a themed wrapper over
`emoji-picker-element`, loaded on first use. `IconPicker` opens it; use `IconPicker` rather than this directly.

```jsx
<EmojiPicker dataSource="/emoji/en/data.json" onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined} />
```

- `dataSource` is `emoji-picker-element-data`'s `en/emojibase/data.json`, served by the app itself — never a CDN.
- `onPick` gets the emoji with the chosen skin tone applied; a compound emoji (👨‍👩‍👧, 🏳️‍🌈) is one pick.
- Favorites are three rows of seven on top, above the search (the library's own single row is hidden); a favorite
  takes the skin tone chosen in the picker. Under them the library's search, categories and a grid three rows high
  that scrolls. Favorites live in the browser (the library's IndexedDB). A browser without any gets a starter set once
  (instruments, books, film, ideas, travel, code…), each at count 1; a pick counts twice, so the user's own picks push
  the starters out. There is no way to open on a category.
- A 320px wide box of fixed height that keeps its size while the library loads; the "Remove the icon" line comes only
  with `onRemove`. `fill` fills the container instead: three rows of favorites, the grid takes the rest. Square, dark, our tokens; the search field takes the focus when it loads.
