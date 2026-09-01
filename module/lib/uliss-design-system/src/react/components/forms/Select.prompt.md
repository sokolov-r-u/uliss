Dropdown — the field shell plus a flush list.

```jsx
<Select label="Sex" greek="γενος" value="Woman" options={['Woman', 'Man', 'Prefer not to say']} selected={0} open />
```

The list is attached (`borderTop: none`), never floating with a shadow. Selection = surface ground + 2px accent left
edge + tick. Use `OptionList` instead when there are three or fewer options and the choice deserves to be visible.
