A Settings row — the hint states the current value.

```jsx
<SettingsRow first label="Appearance" hint="Obsidian · Ochre · Regular" active />
<SettingsRow label="Sky" hint="Focus · colour by constellation" />
<SettingsRow label="Account" hint="Wayfarer · born Mar 1991" />
<SettingsRow label="Language" hint="English · Uliss replies in English" />
```

Write the hint as data, never as blurb: "Style · accent" is acceptable, "Customise how Uliss looks" is not.

The row is one native button and accepts standard button/ARIA attributes. Use `disabled` for a confirmed but unavailable
setting; do not simulate inertness with `pointer-events` or opacity on an interactive wrapper.
