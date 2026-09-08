# LabelRow

The only label row in Uliss. Use it two ways and no others.

**Above a field** — `<LabelRow label="Name" greek="ὄνομα" />`, or with a live
value on the right: `<LabelRow label="Name" right={<span>08 / 24</span>} />`.
`TextField` and `Select` render this for you when given a `label`; do not stack
your own.

**As a section divider** — `<LabelRow rule>Ground</LabelRow>`. This is the only
divider in the product. Never box a group, never put a card around a section,
never use a full-width rule without a label on it.

The gloss is ornament: it must never carry information the user needs. Outside
onboarding surfaces, leave it off.
