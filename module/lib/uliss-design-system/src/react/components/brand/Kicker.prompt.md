Uppercase micro-label — use it for anything that is chrome rather than content.

```jsx
<Kicker size={9} spacing="3px" color="var(--accent)">Appearance</Kicker>
<Kicker size={9} spacing="2px" color="var(--text-faint)">3 new</Kicker>
```

- **Colour is the state:** `--accent` = the screen you are on, `--cream` = active row, `--cream-dim` = default,
  `--text-faint` = quiet meta.
- Smaller size ⇒ wider tracking. 12px/2px, 10.5px/4px, 9px/3px, 8.5px/3px are the pairs actually used.
- Never use it for sentences. One to four words.
