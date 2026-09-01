The mobile header. Arrangement, not decoration: kicker says where you are, numeral says how many, title says which one.

```jsx
<TopBar label="Notes" count={142}
  right={<Kicker size={9} spacing="2px" color="var(--text-faint)">3 new</Kicker>} />

<TopBar center={<SearchField query="ritual" />} />   {/* search replaces the middle */}
```

- `count={0}` renders — an empty product still states its count.
- Only one action in `right`, two at the very most.
- No wordmark, no back arrow. Sub-screens print a small `← Settings` row above their own kicker.
