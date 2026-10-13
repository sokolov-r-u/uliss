# Uliss design system — how to build with it

Uliss is a **dark-only, square, serif** system. Every component styles itself with inline styles that read CSS custom
properties; there are **no CSS classes** to apply and no provider to wrap.

## Setup (required)

1. Load `styles.css` — it imports the fonts (Source Serif 4, Cinzel) and every token.
2. Paint the host ground yourself. Components assume the app body below; without it they render light-on-white and
   are unreadable:

```css
body { margin: 0; background: var(--bg); color: var(--cream); font-family: var(--font-text); }
:where(button, input, select, textarea, a, [tabindex]):focus-visible {
  outline: 2px solid var(--accent-2); outline-offset: 3px;
}
```

3. Optional theming lives on `<html>`: `data-ground="obsidian|void"`, `data-accent="ochre|terracotta|patina|bone"`,
   `data-read="compact|regular|large|larger"`. Defaults need no attributes.

Phone screens start from `PhoneScreen` inside a sized frame (it fills 100% of its parent), then `TopBar`, then a
content column with `padding: '0 18px'` and `flex: 1, minHeight: 0`.

## Styling your own layout glue

Use inline `style` with tokens — never raw hex, never `border-radius`, never box-shadow (modals only).

| Family  | Tokens                                                                                                                                                                                                             |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Grounds | `--bg-deep` (sky, sign-in) · `--bg` · `--bg-surface` · `--bg-panel` · `--bg-muted`                                                                                                                                 |
| Text    | `--cream` · `--cream-dim` · `--text-muted` · `--text-faint` · `--read-fg`                                                                                                                                          |
| Lines   | `--line` · `--line-strong` · `--line-chip`                                                                                                                                                                         |
| Accent  | `--accent` · `--accent-2`; destructive text only: `--terracotta` (there is no red)                                                                                                                                 |
| Type    | `--font-text` (all UI and reading) · `--font-display` (Cinzel: Wordmark and counts only) · `--text-2xs`…`--text-2xl` · `--read-size` / `--read-leading` for body copy · weights `--w-body` `--w-ui` `--w-emphasis` |
| Space   | `--space-1`…`--space-6` (4–32px) · `--gutter` (18px) · `--row-min` (34px) · `--touch` (44px)                                                                                                                       |
| Motion  | `--dur-hover` + `--ease` (colour changes only)                                                                                                                                                                     |

Chrome labels are `Kicker` (uppercase, tracked), section dividers are `<LabelRow rule>`, icons are
`<Icon name=… />` coloured by a parent `color`. Rows are separated by height, not cards or boxes.

## Component APIs

Each component has `components/<group>/<Name>/<Name>.d.ts` (props) and `<Name>.prompt.md` (usage rules) — read the
prompt before using it. The `.d.ts` files omit inherited DOM props: `Button`, `IconButton`, `ActionChip`, `MicButton`
and `SettingsRow` are native buttons and accept `onClick`, `disabled`, `type`, `aria-*`; `TextField` forwards native
input props. `Dialog`, `Notice` and `ItemMenu` are overlays — the caller decides when they mount.

## Example

```jsx
const {PhoneScreen, TopBar, ListRow, Icon, Button, LabelRow} = window.UlissDS;

<div style={{width: 375, height: 720}}>
    <PhoneScreen>
        <TopBar label="Notes" count={142} onMenu={openNav}/>
        <div style={{flex: 1, minHeight: 0, overflow: 'auto', padding: '0 var(--gutter)'}}>
            <LabelRow rule>This week</LabelRow>
            <ListRow title="The empty room" date="Jun 22" unread onClick={open}
                     meta={<><Icon name="star" size={12}/>4</>}/>
            <ListRow title="Notes on forgetting" date="Jun 18" dim onClick={open}
                     meta={<><Icon name="star" size={12}/>6</>}/>
            <div style={{marginTop: 'var(--space-5)'}}>
                <Button variant="outline" size="lg" full>Start a chat</Button>
            </div>
        </div>
    </PhoneScreen>
</div>
```
