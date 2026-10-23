The full Unicode emoji set with search, favorites ("frequently used") and skin tones: a themed wrapper over
`emoji-picker-element`, loaded on first use. `IconPicker` opens it; a `Notice` step can host it directly.

```jsx
<EmojiPicker dataSource="/emoji/en/data.json" onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined} />
<EmojiPicker fill dataSource="/emoji/en/data.json" onPick={choose} />
```

- `dataSource` is `emoji-picker-element-data`'s `en/emojibase/data.json`, served by the app itself — never a CDN.
- `onPick` gets the emoji with the chosen skin tone applied; a compound emoji (👨‍👩‍👧, 🏳️‍🌈) is one pick.
- Favorites live in the browser (the library's IndexedDB). A browser without any gets a starter set once (instruments,
  books, film, ideas, travel, code…), each at count 1; a pick counts twice, so the user's own picks push the starters
  out. There is no way to open on a category.
- 320 × 380 by default, or `fill` for its container; the box keeps its size while the library loads, and the
  "Remove the icon" line (only with `onRemove`) sits inside it. Square, dark, our tokens; the search field takes the
  focus when it loads.
