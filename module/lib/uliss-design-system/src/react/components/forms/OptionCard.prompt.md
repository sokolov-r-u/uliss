Pickable option that shows what it does.

```jsx
<OptionCard label="Obsidian" note="Neutral black grounds" on={styleId === 'default'}
  onPick={() => setStyleId('default')}
  preview={Object.values(preset.vars).map((c, i) => (
    <span key={i} style={{ flex: 1, background: c }} />
  ))} />
```

The tick/empty-box pair on the right is load-bearing: it keeps the selected state readable without relying on the accent
border alone. Use `OptionList` for a column of `dot`-marker rows (the onboarding radio).
