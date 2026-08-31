Rectangular, uppercase, letterspaced. Never rounded, never shadowed.

```jsx
<Button variant="primary" size="lg" full>Continue</Button>
<Button variant="outline">Start a chat</Button>
<Button variant="quiet" size="md">New note</Button>
<Button variant="ghost">Not now</Button>
```

- **One `primary` per screen at most** — it is reserved for the single decisive step in a blocking notice.
- `size="lg"` (44px) whenever the button is a primary touch target on a phone.
- Empty states use `outline`; header actions use `quiet`; dialog dismissals use `ghost`.
- Hover changes colour only, over 0.15s. No lift, no scale, no fill swap.
