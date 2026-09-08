The sign-in and empty-state sky — seeded, static, decorative.

```jsx
<div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
  <StarField id="auth" count={460} aspect={0.55} fadeStart={0.38} />
</div>
```

- Always absolutely positioned behind content at `zIndex: 0`; content sits at `zIndex: 1`.
- Give each instance its own `id` — two fields sharing an id share a gradient and one of them loses its fade.
- Stars are white (`--star-fill`), never accent-tinted. Warmth in this product comes only from the accent, and the
  accent never touches the sky.
