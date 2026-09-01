The logotype — Cinzel, flat fill, two contexts only.

```jsx
<Wordmark size={34} />                                          {/* in-app: ochre */}
<Wordmark size={52} color="var(--wordmark-login)" />            {/* sign in: warm white */}
```

Never gradient. Never inside a screen header — screen headers carry `label · count · title` instead (see `TopBar`).
