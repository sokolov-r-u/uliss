An on/off settings row: uppercase name, one hint line, a square switch on the right. The whole row toggles.

```jsx
<SettingsToggle label="Posters in the sky" hint="Notes with a poster show it instead of their star"
  on={settings.posters} onChange={(posters) => onSettings({posters})} divider />
```

- `role="switch"` with `aria-checked`; Enter and Space toggle it like any button. `onChange` gets the new value.
- Name 10.5px uppercase `--cream-dim`; hint 10px `--text-faint`; switch track 34 × 16, knob 10px, on = `--accent`,
  off = `--line-strong`. At least 44px tall.
- `divider` draws a `--line` hairline above the row, for rows stacked under other settings.
- Square like the rest of the kit; the host's `:focus-visible` rule draws the focus ring.
