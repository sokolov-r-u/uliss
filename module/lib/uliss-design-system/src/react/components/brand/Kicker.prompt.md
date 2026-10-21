Uppercase micro-label — use it for anything that is chrome rather than content.

```jsx
<Kicker size={9} spacing="3px" color="var(--accent)">Appearance</Kicker>
<Kicker size={9} spacing="2px" color="var(--text-faint)">3 new</Kicker>
```

- **Colour is the state:** `--accent` = the screen you are on, `--cream` = active row, `--cream-dim` = default,
  `--text-faint` = quiet meta.
- Smaller size ⇒ wider tracking. 12px/2px and 10.5px/4px are the pairs actually used; a requested size below 10px
  renders at 10px (the legibility floor), so 9 and 8.5 read as 10.
- Never use it for sentences. One to four words.
