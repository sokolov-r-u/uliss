# User service instructions

Read the repository `AGENTS.md`, this module's `README.md`, and the security-library guidance before editing
user-service.

## Invariants

- Keep transport adapters thin. REST and gRPC parse/map requests and delegate; onboarding behavior and transaction
  boundaries belong in services and commands.
- The authenticated REST user comes from the JWT `userId` claim. The internal gRPC lookup uses the auth-user UUID and
  lazily creates the profile.
- Onboarding commands are Spring components collected by command code. Add a new step as a command instead of extending
  a controller/service conditional chain.
- `SET_DISPLAY_NAME` is blocking and rejects an empty value. `COMPLETE_PROFILE` is optional and an empty submission
  means `SKIPPED`.
- The onboarding command discriminator stays in the request body. Do not create per-command or separate skip endpoints
  without an explicit contract change.
- Message ordering remains blocking-first. Preserve the state transition from `PENDING` to `COMPLETED` or `SKIPPED`.
- The `/user` REST prefix comes from `WebMvcPathPrefixConfig`; do not repeat it in controller mappings.

## Implementation rules

- Keep Spring and persistence annotations out of onboarding command/request domain behavior where practical; adapters
  own transport concerns.
- Add catalog messages through an append-only Flyway migration with stable identifiers, then add the corresponding
  command and API/frontend handling.
- Do not trust identifiers supplied by the browser when the authenticated `userId` claim already defines ownership.
- Changes to gRPC identity mapping, JWT claims, onboarding command codes, or request fields are inter-service/public
  contract changes.

## Verification

- Use `./gradlew :user:test` for service, command, REST, and gRPC behavior.
- Use `./gradlew :user:integrationTest` when persistence, Flyway, or complete application wiring changes; Docker is
  required.
- Do not run `:user:bootRun` or execute migrations manually without explicit permission.

