The full Unicode emoji set with search, favorites ("frequently used") and skin tones: a themed wrapper over
`emoji-picker-element`, loaded on first use. `IconPicker` opens it; use `IconPicker` rather than this directly.

```jsx
<EmojiPicker dataSource="/emoji/en/data.json" onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined} />
```

- `dataSource` is `emoji-picker-element-data`'s `en/emojibase/data.json`, served by the app itself — never a CDN.
- `onPick` gets the emoji with the chosen skin tone applied; a compound emoji (👨‍👩‍👧, 🏳️‍🌈) is one pick.
- The favorites row stands under the categories, above the grid (moved there by a style in the library's shadow
  root). Favorites live in the browser (the library's IndexedDB). A browser without any gets a starter set once
  (instruments, books, film, ideas, travel, code…), each at count 1; a pick counts twice, so the user's own picks push
  the starters out. There is no way to open on a category.
- A 320 × 380 box that keeps its size while the library loads; the "Remove the icon" line (only with `onRemove`) sits
  inside it. Square, dark, our tokens; the search field takes the focus when it loads.
