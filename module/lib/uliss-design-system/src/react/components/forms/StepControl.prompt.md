Stepped choice — there are no sliders in this product.

```jsx
<StepControl
  steps={[{ id: 'compact', label: 'Compact' }, { id: 'regular', label: 'Regular' },
          { id: 'large', label: 'Large' }, { id: 'larger', label: 'Larger' }]}
  value={sizeId} onPick={setSizeId}
  renderStep={(s, on) => (
    <span style={{ fontFamily: 'var(--font-text)', fontSize: SIZE_PX[s.id], lineHeight: 1,
                   color: on ? 'var(--read-fg)' : 'var(--text-muted)' }}>Aa</span>
  )} />
```

- Three or four cells. More than four and it stops being checkable at a glance.
- Labels are words. If you find yourself writing "0.8×" or "12px", rename the step.
- `renderStep` should show the step's actual effect wherever that is possible.
- The frame is a labelled `radiogroup`; every step is a native button radio with `aria-checked`. `disabled` applies to
  the complete group, removes activation and keeps the selected value exposed to assistive technology.
- Arrow keys move focus and selection to the adjacent step; the checked step is the only step in the normal Tab order.
