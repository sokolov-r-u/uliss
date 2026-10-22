The modal card. Every blocking or dismissible thing Uliss says.

```jsx
<Notice blocking variant="framed" progress={{ current: 1, total: 3 }}
  title="What should Uliss call you?" primary="Continue" skip="Later" onSkip={...}>
  <TextField label="Name" placeholder="Wayfarer" value={name}
    onChange={(event) => setName(event.target.value)} maxLength={24} />
</Notice>

<Notice variant="minimal" title="Uliss reorganised four notes last night"
  body="Nothing was deleted. You can undo any of it from Updates." primary="See what changed" secondary="Dismiss" />
```

- Mount it over a **blurred, dimmed copy of the live screen** — never over a blank ground. The user must see where they
  are.
- 304px wide by default; on desktop it centres over the window at the same width.
- `blocking` ⇒ no close, no secondary. Add `skip` + `onSkip` unless the step is truly mandatory.
- One `primary`. Copy is what happens next ("Continue", "See what changed"), never "OK".
- `title` and `body` accept `ReactNode`. `busy` exposes `aria-busy`; `primaryDisabled` and native disabled
  state prevent activation; `secondaryDisabled` does the same for the secondary action, which stays in place so the
  card keeps its size. Secondary, skip and close render only with their matching labels/handlers; `showClose` is
  explicit. The card labels itself as a dialog. Its overlay owns Escape, focus trap and focus restoration.
- `step` is a second step of the same question in the same card (choosing a place for a summary note): its title and
  content cover the first step, which stays hidden and inert only to hold the size, so the card does not move. The
  corner button turns into Back and Escape steps back (`step.onBack`) instead of closing. Content that may be long
  (a `ConstellationPicker` with `fill`) takes the room under the title and scrolls inside.
