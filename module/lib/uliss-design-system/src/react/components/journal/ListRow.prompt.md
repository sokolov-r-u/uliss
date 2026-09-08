One line per note or chat. Dense index, not a feed.

```jsx
<ListRow title="The empty room" date="Jun 22" unread
  meta={<><Icon name="star" size={12} />4</>} />
<ListRow title="Notes on forgetting" date="Jun 18" dim
  meta={<><Icon name="star" size={12} />6</>} />
```

- **Absolute dates only.** 'Jun 22'. No "yesterday", no "2h ago".
- `meta` is `star` + link count on notes, `noteDoc` + note count on chats.
- `unread` shows the dot; `dim` greys everything already read. Both together are how a fresh row stands out — no badges,
  no bold.
- Rows sit directly on the ground inside an 18px gutter, separated by nothing but their own height.
- `onClick` owns the main native button. `onMenu` owns a separate 44px menu button with `menuLabel`; the two actions
  must never be nested. Omit `onClick` for a non-interactive fixture row and omit `dots` when no menu exists.
