The brand's symbol mark — a compass rose, filled accent.

```jsx
<StarMark size={28} />
<StarMark size={16} glow={false} />   {/* inside a 30×30 --bg-muted tile */}
```

Turn `glow` off whenever the mark sits inside a bordered tile — the halo reads as a smudge against an edge. Do not use
it where a link *count* is meant; that is `<Icon name="star" />`.
