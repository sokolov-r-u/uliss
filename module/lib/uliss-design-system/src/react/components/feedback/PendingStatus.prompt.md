Says what Uliss is still doing while there is nothing to show yet.

```jsx
<PendingStatus label="thinking…"/>
<PendingStatus label="searching notes…"/>
```

- One look for every wait: the same dot, the same pulse, the same type. Change only the label; never add a spinner,
  a progress bar or a second pulsing style.
- Labels are lowercase, end with an ellipsis, and name the activity ("searching notes…"), not the delay
  ("please wait…").
- Swap the label in place as the activity changes; do not remount or stack several lines.
- Remove it as soon as real content arrives — it stands in for content, it never sits beside it.
