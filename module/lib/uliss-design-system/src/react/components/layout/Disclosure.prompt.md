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

```jsx
<section className="context-section">
  <Disclosure variant="section" title="Poster" open={open} onToggle={setOpen}
    actions={<>
      <IconButton title="Change poster" onClick={edit}><Icon name="edit" size={14} /></IconButton>
      <IconButton title="Remove poster" onClick={confirmRemove}><Icon name="trash" size={14} /></IconButton>
    </>}>
    <PosterFrame state="image" src={posterUrl} alt="Dune sea poster" />
  </Disclosure>
</section>
```

- `variant="section"` is the header of a details-panel section: the Kicker (9px, 2.5px tracking) with the chevron on
  the right and the optional hint before it. Its button is a 44px target that overhangs the 30px header line, so the
  section keeps the rhythm of a plain `PanelSection`. It draws no padding or hairline: the host section does.
- `actions` (section only) puts icon buttons between the title and the chevron, outside the toggle, and only while the
  section is open: the edit and remove of what the section shows. Keep them to two `IconButton`s.
