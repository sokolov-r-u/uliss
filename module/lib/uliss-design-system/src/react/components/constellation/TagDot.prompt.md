A constellation's colour chip.

```jsx
<TagDot color={colorFor(tag)} />
<TagDot color={colorFor(tag)} size={5} />   {/* inline in a dense row */}
```

Never give a sub-constellation its own hue — inherit the root's hue and change lightness only. The hue is how a branch
is recognised in the sky.
