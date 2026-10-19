Colour of one branch, inline under the branch's actions.

```jsx
// A root owns its hue.
<ConstellationColorEditor mode="hue" name="Music" hue={264} onSave={(hue) => save({hue})} onClose={close} />

// A sub-constellation inherits the hue and picks a lightness step.
<ConstellationColorEditor mode="lightness" name="Jazz" hue={264} lightness="LIGHT" rootName="Music"
  onSave={(lightness) => save({lightness})} onClose={close} />
```

- Never offer a hue to a sub-constellation: the hue is how a family is recognised in the sky. `mode` follows the
  branch's level, not a user choice.
- Hue mode: the 13-tone palette (`CONSTELLATION_PALETTE`) first, the slider ("Or shift the hue") for any 0–359 value.
- Lightness mode: Deep · Base · Light · Pale, with "Inherits from <root>".
- The preview chip shows the name in the colour being chosen; Save is disabled until the value changes and while
  `busy`.
- Draw every constellation colour with `constellationColor(hue, lightness)`; a root is `BASE`.
- Palette cells and steps are native `role="radio"` buttons in labelled radiogroups; the slider is labelled "Hue".
