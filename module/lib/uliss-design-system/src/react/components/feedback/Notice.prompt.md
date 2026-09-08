The modal card. Every blocking or dismissible thing Uliss says.

```jsx
<Notice blocking variant="framed" progress={{ current: 1, total: 3 }}
  greek="ὄνομα" title="What should Uliss call you?" primary="Continue" skip="Later" onSkip={...}>
  <TextField label="Name" placeholder="Wayfarer" value="Wayf" max={24} />
</Notice>

<Notice variant="minimal" title="Uliss reorganised four notes last night"
  body="Nothing was deleted. You can undo any of it from Updates." primary="See what changed" secondary="Dismiss" />
```

- Mount it over a **blurred, dimmed copy of the live screen** — never over a blank ground. The user must see where they
  are.
- 304px wide by default; on desktop it centres over the window at the same width.
- `blocking` ⇒ no close, no secondary. Add `skip` + `onSkip` unless the step is truly mandatory.
- One `primary`. Copy is what happens next ("Continue", "See what changed"), never "OK".
- `title`, `body` and Greek gloss accept `ReactNode`. `busy` exposes `aria-busy`; `primaryDisabled` and native disabled
  state prevent activation. Secondary, skip and close render only with their matching labels/handlers; `showClose` is
  explicit. The card labels itself as a dialog. Its overlay owns Escape, focus trap and focus restoration.
