Dropdown — the field shell plus a flush list.

```jsx
<Select label="Sex" greek="γένος" value={sex} onChange={setSex}
  options={[{ value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }]} />
```

The list is attached (`borderTop: none`), never floating with a shadow. Selection = surface ground + 2px accent left
edge + tick. Use `OptionList` instead when there are three or fewer options and the choice deserves to be visible.

Options are typed `{value, label, greek?}` records. `value` and `onChange` are controlled; `open` and `onOpenChange`
optionally control disclosure. The trigger is a native button and the popup is a single-select listbox: Arrow keys move,
Home/End jump, Enter/Space choose, Escape closes and restores trigger focus. `disabled` removes all activation: an open
popup is suppressed immediately, including when a controlled caller continues to provide `open={true}`, and receives
`onOpenChange(false)` so the caller can reconcile its state.
