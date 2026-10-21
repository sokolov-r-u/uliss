# Architecture decisions: design system

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-21 — One focus trap for overlays; contrast-safe faint text and field borders

- **Context:** Dialog and the web Notice overlay each trapped focus their own way, re-ran on every new callback
  (focus jumped on a parent re-render) and closed together with an open Select on one Escape. `--text-faint` was
  ~4.0:1 and `--line-strong` ~2.1:1 on panels; inline `outline: none` hid the focus ring on several fields.
- **Decision:** `useFocusTrap` (exported) owns initial focus, Tab wrapping, Escape and focus restore; callbacks go
  through a ref, and an Escape already handled (`defaultPrevented`) is ignored. Radio groups keep one tab stop even
  when nothing is selected, and arrow keys skip disabled options. `--text-faint` becomes `#7d828b` (≥4.5:1) and
  `--line-strong` 0.42 alpha (≥3:1); no component sets an inline outline on a focusable field.
- **Consequences:** faint text and strong lines look brighter. The public surface changed (hook export, Swatch
  `tabIndex`, ListRow `dots` default, tokens): a Claude Design sync is due after merge.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 19.
