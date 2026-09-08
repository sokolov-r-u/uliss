The one circle and the one glow in Uliss.

```jsx
<MicButton variant="solid" size={138} />
<div style={{ marginTop: 30 }}><Kicker size={10} spacing="3.5px">Tap to speak</Kicker></div>
```

- `solid` idle → `ring` armed → `pulse` recording. Do not invent a fourth state.
- Always paired with a Kicker caption ~30px below.
- The circular shape is licensed only here. Do not round anything else in sympathy.
- The control is a native button with an accessible name. Pass `disabled` whenever speech is not backed by a real
  contract; a production-disabled mic never enters `ring` or `pulse` state.
