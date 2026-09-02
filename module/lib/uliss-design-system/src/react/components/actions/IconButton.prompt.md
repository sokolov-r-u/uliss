One glyph, one hit target, no chrome.

```jsx
<IconButton title="Close" onClick={onClose}><Icon name="close" size={17} /></IconButton>
<IconButton s={44} title="Linked notes"><Icon name="panelRight" size={17} /></IconButton>
```

Give it a `title` — these are unlabelled and it is the only affordance. Use `s={44}` on phone.

It is a native button. `title` is required and becomes the accessible name unless an explicit `aria-label` is supplied.
Standard button attributes, native keyboard activation, focus, `type` and `disabled` all apply.
