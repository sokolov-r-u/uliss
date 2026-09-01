The 48px field. Focus is loud on purpose — it marks the one thing being asked.

```jsx
<TextField label="Name" greek="ονομα" placeholder="How should Uliss call you?" value="Wayfarer" max={24} />
```

- Block caret, not a line caret — 8×18, `--accent-2`, 1.1s step blink.
- The counter appears only once there is a value.
- No error styling exists. If a value can be wrong, constrain the input instead.
