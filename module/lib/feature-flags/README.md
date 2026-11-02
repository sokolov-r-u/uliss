# feature-flags

Feature flags for the JVM services through the [OpenFeature](https://openfeature.dev) API, evaluated in-process from a
[flagd](https://flagd.dev) JSON file (package `io.uliss.featureflags`, auto-configured). No flag server or container.

## Usage

Inject the OpenFeature `Client` and evaluate with the user's id as the targeting key; the default is always `false`:

```kotlin
client.getBooleanValue(FeatureFlagKeys.NOTE_RESUMMARIZE, false, ImmutableContext(userId.toString()))
```

`FeatureFlagKeys` holds every key; `FeatureFlagKeys.ALL` is the set the web client receives.

## Configuration

- `uliss.feature-flags.file` — path of the flagd file. Unset or missing: every flag is off (warning at startup) until
  the service restarts with the file in place; a file created later is not picked up.
- `uliss.feature-flags.poll-interval` — how often the file's modification time is checked (default `5s`).

The file follows the flagd schema; `infra/flags/flags.example.json` shows every pattern below. A flag is `variants`
(`on`/`off`), `defaultVariant` (used when there is no `targeting` or it returns nothing), and an optional `targeting`
rule ([JsonLogic](https://flagd.dev/reference/flag-definitions/#targeting-rules)) that picks a variant per user. The
only context attribute is `targetingKey`, the user id.

| Example flag               | Rule                                                        | Result                                  |
|----------------------------|-------------------------------------------------------------|-----------------------------------------|
| `example-everyone`         | `"defaultVariant": "on"`, no `targeting`                     | on for everyone                         |
| `example-disabled`         | `"state": "DISABLED"`                                        | off for everyone, whatever the rule     |
| `example-listed-users`     | `{"if": [{"in": [{"var": "targetingKey"}, [ids]]}, "on", "off"]}` | on for the listed ids               |
| `note-resummarize`         | `{"if": [{"$ref": "betaUsers"}, "on", "off"]}`               | on for the shared `betaUsers` list      |
| `example-ab-test`          | `{"fractional": [["on", 50], ["off", 50]]}`                  | half of users in each group             |
| `example-gradual-rollout`  | `{"fractional": [["on", 10], ["off", 90]]}`                  | on for 10% of users                     |
| `example-beta-and-rollout` | `if` beta users `on`, else `fractional` 20/80                | beta users plus 20% of the rest         |

- `$evaluators` holds rules shared by several flags (`betaUsers`); a flag refers to one with `{"$ref": "<name>"}`.
- `fractional` hashes the flag key with the user id: a user stays in the same group on every request and in every
  service, and different flags split users independently. Raising 10 → 20 keeps the first 10% on.
- An A/B test here only splits users: nothing records which group a user saw, so measuring the result needs its own
  analytics.
- Flags the code does not know (the `example-*` ones) are ignored; only `FeatureFlagKeys` are evaluated.

## Runtime behavior

- A change is applied within the poll interval, without a restart. Only a newer modification time triggers a re-read.
- A file invalid at startup: every flag is off until the file is fixed. A file broken later: the last valid values stay.
- A file deleted while the service runs stops the polling for good; restart the service after restoring it.
- In Docker mount the file's directory, not the file: editors replace the file, and a single-file bind mount keeps
  showing the old one.

## Tests

`testFixtures` provide `TestFeatureFlags`: register its `provider` as a `FeatureProvider` bean to replace the file, then
`enable`, `enableFor(key, userIds)` and `reset` per test.
