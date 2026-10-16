Stands in for a link list that is still being computed.

```jsx
{note.linksPending ? <PendingLinks /> : <LinkList items={note.links} />}
```

Use it anywhere links are listed — the note panel, the linked-notes drawer, a fresh star in the sky. Never show an empty
list where a pending one is meant: "none" and "not yet" are different facts.

It is `PendingStatus` with a links label, so it is a live status region like every other wait.
