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

- `uliss.feature-flags.file` — path of the flagd file. Unset or missing: every flag is off (warning at startup).
- `uliss.feature-flags.poll-interval` — how often the file's modification time is checked (default `5s`).

The file follows the flagd schema. On for everyone: `"defaultVariant": "on"`. On for some users only:

```json
{
  "flags": {
    "note-resummarize": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "targeting": { "if": [{ "in": [{ "var": "targetingKey" }, ["<userId>"]] }, "on", "off"] }
    }
  }
}
```

## Runtime behavior

- A change is applied within the poll interval, without a restart. Only a newer modification time triggers a re-read.
- A file invalid at startup: every flag is off until the file is fixed. A file broken later: the last valid values stay.
- A file deleted while the service runs stops the polling for good; restart the service after restoring it.
- In Docker mount the file's directory, not the file: editors replace the file, and a single-file bind mount keeps
  showing the old one.

## Tests

`testFixtures` provide `TestFeatureFlags`: register its `provider` as a `FeatureProvider` bean to replace the file, then
`enable`, `enableFor(key, userIds)` and `reset` per test.
