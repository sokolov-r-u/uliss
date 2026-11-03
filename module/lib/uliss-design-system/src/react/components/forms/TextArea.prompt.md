The multi-line field: `TextField`'s panel, focus and soft limit, for text longer than a line.

```jsx
<TextArea label="About me" placeholder="Work, where you live, what matters to you" value={about} limit={2000}
  onChange={(event) => setAbout(event.target.value)} />
```

```jsx
<TextArea aria-label="Rule 2" value={rule} limit={300} rows={2}
  onChange={(event) => setRule(event.target.value)} />
```

- It grows with its text from `rows` lines (default 4) and never scrolls inside itself; no resize handle.
- `limit` is soft, as on `TextField`: the input is never cut, the counter reads `N/limit` (characters of the trimmed
  value) once there is a value, and past the limit the edge and counter turn `--terracotta` and the field gets
  `aria-invalid`. The host disables the action that would submit the value.
- Without `label`, pass `aria-label`. The field is a controlled native `<textarea>`; standard props such as
  `placeholder`, `autoFocus`, `disabled` and `aria-*` are forwarded.
