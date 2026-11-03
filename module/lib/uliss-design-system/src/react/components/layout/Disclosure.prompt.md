A section that opens in place: a settings-row header (title, one hint line, chevron) and a body under it.

```jsx
<Disclosure first title="About me" hint="Designer in Lisbon" open={open} onToggle={setOpen}>
  <p>What the assistant reads about you, in your own words.</p>
</Disclosure>
<Disclosure title="Profile rules" hint="3 rules" open={false} onToggle={setRulesOpen}>
  …
</Disclosure>
```

- Controlled: pass `open` and `onToggle`. Stack several for one screen; `first` drops the top hairline of the first.
- The hint states what is inside as data ("3 rules", the first words of a text), never a blurb — as `SettingsRow`.
- The header is one native button with `aria-expanded` and `aria-controls`; the chevron points down when closed and up
  when open.
- The body stays mounted while closed (`hidden`), so a form inside keeps unsaved input until the screen goes away.
