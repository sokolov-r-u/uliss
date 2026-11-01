# feature-flags decisions

## 2026-11-01 — flagd file provider in an isolated OpenFeature API

**Decision:** Each Spring context creates its own `OpenFeatureAPI.createIsolated()` with the flagd provider in `FILE`
mode and exposes its `Client`; services call the OpenFeature API directly, with no wrapper of ours. An unset or missing
file gives `NoOpProvider`; a provider that fails to start (invalid file) is kept, logged as a warning, and answers the
caller's default. Every evaluation passes `false` as the default, so failures are fail-closed.

**Consequences:** Verified against flagd provider 0.15.0 (tests in `FeatureFlagsAutoConfigurationTest`): a changed
file is applied after a poll; a file broken at runtime leaves the last valid flags (the provider goes `STALE`); a file
invalid at startup is applied once fixed. From the provider's source: it polls the modification time, so a rewrite
within the same millisecond is missed, and a deleted file ends the polling thread until restart. The provider brings
gRPC and protobuf for its remote modes; their versions follow the Spring Boot BOM, and its Jackson 2 follows the
catalog override.

**Source:** task `docs/tasks/2026-11-01-note-resummarize.md`, block 1.
