The formatting strip above a note being edited. It only reports commands; the editor owns the text.

```jsx
<EditorToolbar
  active={{bold: true}}
  unavailable={{redo: true}}
  onCommand={(command) => editor.run(command)}
  original={false}
  onOriginalChange={setOriginal}
/>
```

- The set is fixed and minimal: Bold, Italic, Heading, Bulleted list, Numbered list, Undo, Redo, then `Original` on
  the right. Do not add buttons for links, quotes, code or tables — that formatting is asked of the model instead.
- `active` marks formats at the caret (`aria-pressed`, accent glyph); `unavailable` disables a single command (empty
  undo history). Undo/Redo never read as pressed.
- `original` swaps the editor for the saved version: the switch reads as pressed and every formatting button is
  disabled until it is switched off. Edits are kept while the original is shown.
- `disabled` locks the whole strip, `Original` included — use it while something else rewrites the note.
- It sits directly above the editor, full width, on a hairline (`--line`). Make it `position: sticky` from the screen
  via `style` so it stays reachable on a long note; the toolbar wraps on a phone, it never scrolls sideways.
- Buttons are native, 44px touch targets, and do not take focus from the editor on mouse down.
