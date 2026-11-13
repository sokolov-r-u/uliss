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
`tall` makes every `dot` row 66px instead of 48px: a choice of two or three rows that fills a dialog's field area, so
the dialog matches the size of its other step (the repeated Summarize: add to the note or save a new one).

Each card is a native button with `role="radio"` and `aria-checked`. `OptionList` supplies `role="radiogroup"`; give it
a concise `label`. Native Space/Enter activation, focus and `disabled` behavior are part of the contract.
Arrow keys move selection within `OptionList` and focus the newly checked radio.
