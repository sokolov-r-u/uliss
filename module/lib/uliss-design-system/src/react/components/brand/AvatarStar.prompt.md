A note's poster in the sky: a round avatar ringed in its main constellation colour, an SVG `<g>` in screen space.

```jsx
<svg viewBox={`0 0 ${w} ${h}`}>
  {loaded
    ? <AvatarStar x={sx} y={sy} r={AVATAR_RADIUS[settings.posterSize]} src={poster.url} crop={poster.avatar}
                  color={mainColour} glow={settings.glow}/>
    : <circle cx={sx} cy={sy} r={3.2} fill={mainColour}/>}
</svg>
```

- `r` comes from `AVATAR_RADIUS` by the sky's own Poster size (apart from Star size): fine 8, regular 10, bold 12,
  beacon 14 px. Its size stays the
  same at any zoom, like a star.
- `crop` is the avatar frame (`PosterCrop.avatar`, fractions of the image); without it the image's centre fills the
  circle. The image is never stretched (`preserveAspectRatio="xMidYMid slice"`, see `avatarImageBox`).
- The ring is `--avatar-ring-width` in `color`; `glow` adds a halo of r × 1.6 at 14 % (a star's is r × 2.9).
- The host loads the image first (low priority, `referrerPolicy="no-referrer"`) and draws its plain star while the
  image loads or after it failed; no spinner in the sky. The host also draws the name (r + 5 outward), the selection
  and focus rings (r + 5) and the hit area (max(13, r + 3) px).
- The one round exception in the kit besides stars: avatars and their rings are circles.
