Two crops of one poster image: the 2:3 frame the note panel shows and the round sky avatar. It lives inside a
`Dialog` (width 680) as its one child; the Dialog keeps Save and Cancel.

```jsx
<Dialog title="Crop poster" confirm="Save" cancel="Cancel" width={680} onConfirm={save} onCancel={close}>
  <PosterCropper src={poster.url} status="ready" imageWidth={1200} imageHeight={1800}
    mode={mode} onModeChange={setMode} value={crop} onChange={setCrop} title={note.title} />
</Dialog>
```

- `value` is both frames in fractions of the image (`PosterCrop`: `poster` and `avatar`, each `x, y, w, h` in 0..1;
  the avatar as the square around its circle). `fitCrop(stored, width, height)` turns a stored crop, or none, into a
  value that fits the loaded image; `cropImageStyle(frame)` shows a frame of an `<img>` anywhere else.
- The active frame stands still in the middle of the stage (2:3 at 90% of its height, the circle at 80%); the image
  moves and scales under it. The other frame shows as a dashed outline. A `StepControl` switches frames — no sliders.
- Input: drag (mouse or one finger) moves, wheel (8%), −/+ buttons and `+`/`−` keys (15%) and a two-finger pinch zoom;
  arrows move 8px (Shift 32). The stage is focusable and has `touch-action: none`.
- Limits: the frame never leaves the image; zoom goes from the whole image to 4×, and never under 150 image px.
  Reset returns the active frame to its default: the largest 2:3 frame or circle in the middle.
- Fixed sizes: the stage, previews and controls never change between modes or `status` (`loading`, `ready`,
  `unavailable`), so the Dialog keeps its size. Under 560px of its own width (or `compact`) it switches to the
  phone layout: a 280px stage, previews in a row, 44px controls.
- `disabled` locks everything while the crop is saved. Images load with `referrerPolicy="no-referrer"`.
