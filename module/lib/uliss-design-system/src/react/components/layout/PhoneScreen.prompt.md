The mobile artboard — the root of every phone screen.

```jsx
<PhoneScreen>
  <TopBar label="Notes" count={142} />
  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 18px' }}>…</div>
</PhoneScreen>
```

- **18px is the screen gutter.** Content areas take `padding: '0 18px'`; the artboard itself adds none.
- Scroll regions must carry `flex: 1, minHeight: 0` or the column will not clip.
- Use `bg="var(--bg-deep)"` for Sky and sign in; everything else stays on `--bg`.
