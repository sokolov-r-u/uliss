The fixed 2:3 frame of a note poster. The image fills it (cover, centred), so a preview is exactly what is saved.

```jsx
<PosterFrame state="image" src={note.posterUrl} alt={`${note.title} poster`}
  onImageError={() => setUnavailable(true)} />
<PosterFrame state="small" src={url} badge="120 × 180" />
<PosterFrame state="unavailable" host="images.example.com" />
```

- Full width of its container, up to `--poster-max-h` (440px) tall; a wider container centres a 293px frame.
  `--poster-aspect`, `--poster-max-h`, `--poster-max-w` and `--poster-empty` are its tokens.
- States keep one box: `hint` (empty, before a link or for a refused one), `loading` (three static dots, `aria-busy`),
  `image`, `small` (loaded but too small: dimmed, the real size in a --terracotta badge), `broken` (a preview that
  did not load), `unavailable` (a saved poster that stopped loading, with the link's host under the message).
- The image loads with `referrerPolicy="no-referrer"`: the poster's host is never told which note shows it.
  `onImageLoad` / `onImageError` let the host check the size or mark a saved poster unavailable.
- `crop` (a `CropFrame` in fractions, from `PosterCropper`) shows that part of the image in the `image` state; without it
  the image is centred (cover).
- Square like the rest of the kit; no spinner, no rounded corners.
