Accent picker cell.

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
  {ACCENTS.map((a) => (
    <Swatch key={a.id} label={a.label} color={a.accent}
      on={a.id === accentId} onPick={() => setAccentId(a.id)} />
  ))}
</div>
```

Four accents: Ochre `#d99a4e`, Terracotta `#c8643c`, Patina `#5c8a72`, Bone `#b9a888`. Always the full set, always
4-up — a picker that hides options is not a picker.

Each swatch is a native button radio with `aria-checked`; place the four-button grid in a labelled `radiogroup`.
Keyboard focus, Space/Enter and `disabled` are native and must remain visible/testable.
Arrow keys move to and choose the adjacent enabled swatch in its radiogroup.
