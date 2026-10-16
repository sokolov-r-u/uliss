# Domain decisions

Product and domain rules: what the core concepts mean and how they relate. Architecture decisions live in
`DECISIONS.md` files; the order of work lives in `ROADMAP.md`.

Append only. A changed or reversed decision gets a new entry that names the one it replaces; old entries stay.

## 2026-10-16 — Constellations form a tree of places for notes

**Decision:** The user is the centre. Root constellations (Music, Films, Games) grow from the user and can have
sub-constellations at any depth (Music › Rock › Glam rock). Every note has exactly one parent, which is either a
constellation or another note (David Bowie › The Man Who Sold the World). One chat can produce several notes.

**Consequences:** A note in several constellations at once (multi-tagging) is planned after the MVP; the data model
must not preclude it.

## 2026-10-16 — The user chooses the place, the system proposes refinements

**Decision:** The user picks the parent before Summarize. The system then checks the choice and may propose a more
precise place or, after the MVP, an additional constellation. Proposals reach the user through Updates; the user
accepts or rejects them.

## 2026-10-16 — The sky shows notes, not thoughts

**Decision:** Stars in the sky are notes. Edges show the constellation tree and links between notes; a note may have no
links. A note can contain more than one thought; thoughts are not drawn in the sky and serve as material for links.

## 2026-10-16 — Updates carry notices and proposals

**Decision:** Updates is one feed with two kinds of entries: notices for the user (account and background-work
outcomes) and system proposals to review.

## 2026-10-16 — Registration by invitation

**Decision:** The MVP is a closed beta reachable from the public internet. Registration requires an invitation;
existing users can invite others.
