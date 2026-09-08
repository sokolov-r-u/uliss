The 48px field. Focus is loud on purpose — it marks the one thing being asked.

```jsx
<TextField label="Name" greek="ὄνομα" placeholder="How should Uliss call you?"
  value={name} onChange={(event) => setName(event.target.value)} maxLength={24} />
```

- Block caret, not a line caret — 8×18, `--accent-2`, 1.1s step blink.
- The counter appears only once there is a value.
- No error styling exists. If a value can be wrong, constrain the input instead.
- The field is a controlled native `<input>`. Pass `value` and `onChange`; standard input props such as `name`, `type`,
  `autoFocus`, `disabled` and `aria-*` are forwarded. Focus styling follows real focus (the `focused` prop is only for
  static visual scenarios), and the counter follows `maxLength`.
