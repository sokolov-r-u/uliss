The 48px field. Focus is loud on purpose — it marks the one thing being asked.

```jsx
<TextField label="Name" placeholder="How should Uliss call you?"
  value={name} onChange={(event) => setName(event.target.value)} maxLength={24} />
```

```jsx
<TextField label="Name" placeholder="Uliss names it if you don't" value={title} limit={50}
  onChange={(event) => setTitle(event.target.value)}
  trailing={<IconButton title="Dictate the name" onClick={dictate}><Icon name="mic" size={16} /></IconButton>} />
```

- The native caret in `--accent-2` (`caretColor`); no drawn block caret.
- The counter appears only once there is a value.
- No error styling exists. If a value can be wrong, constrain the input instead. The one exception is `limit`, for
  text that can arrive whole (dictation): the input is never cut, the counter reads `N/limit` (code points of the
  trimmed value, whitespace runs as one — the title rule) and past the limit the edge and counter turn `--terracotta`
  and the input gets `aria-invalid`. The host disables the action that would submit the value. Use `limit` or
  `maxLength`, not both.
- `trailing` puts one control inside the field after the input — a dictation `IconButton`, never a second field.
- The field is a controlled native `<input>`. Pass `value` and `onChange`; standard input props such as `name`, `type`,
  `autoFocus`, `disabled` and `aria-*` are forwarded. Focus styling follows real focus (the `focused` prop is only for
  static visual scenarios), and the counter follows `maxLength`.
