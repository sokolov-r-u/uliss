A destination in the sidebar or drawer.

```jsx
<NavRow icon={<Icon name="node" />} label="Chats" active />
<NavRow icon={<Icon name="journal" />} label="Notes" />
<NavRow icon={<Icon name="constellation" size={17} />} label="Constellations" />
<NavRow icon={<Icon name="star" />} label="Sky" />
<NavRow icon={<Icon name="pulse" size={17} />} label="Updates" dot />
```

Five destinations, that order, everywhere. `dot` means "something new" — Uliss never puts a count on an icon; counts
live inside the screen that owns them.
