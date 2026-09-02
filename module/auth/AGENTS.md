# Auth module instructions

Read the repository `AGENTS.md` and this module's `README.md` before editing `module/auth`.

## Invariants

- This module is the OAuth2/OIDC authorization server, not the shared auth mediator in `:security`. Keep their `/oauth2`
  endpoints conceptually separate.
- Keep two ordered security filter chains: authorization-server endpoints first, application/form endpoints second.
- Login remains email-based, but the token subject is the stable auth-user UUID. Add PII only as an explicit separate
  claim.
- Registration remains a server-rendered form. Do not reintroduce a REST registration endpoint or move `displayName`
  into auth.
- User-token enrichment must obtain `userId` from user-service. Preserve the deliberate fail-closed behavior when that
  dependency is unavailable; machine tokens skip user enrichment.
- `uliss-web` remains a confidential client using Authorization Code, PKCE, refresh tokens, rotation, and every
  configured callback URL.
- Persist signing keys and registered clients. Do not replace them with ephemeral in-memory state.
- Keep `AUTH_PUBLIC_URL` for browser-facing issuer/authorization flows and `AUTH_INTERNAL_URL` for service-to-service
  calls.

## Implementation rules

- Keep authentication and token policy in configuration/services, not controllers or templates.
- Preserve eager CSRF token loading on the form-login chain unless the replacement is proven against the large Thymeleaf
  pages.
- Changes to client grants, token claims, subject identity, TTLs, redirect URIs, password hashing, gRPC security, or
  login availability are security-sensitive contract changes and require explicit scope plus tests.
- Login/registration pages consume the shared design-system resources under `/ds/**`. Read the design-system
  instructions before changing shared tokens or assets.
- Flyway migrations are append-only once shared. Never edit an applied migration to change production state.

## Verification

- Use `./gradlew :auth:test` for module behavior.
- Use `./gradlew :auth:integrationTest` when persistence, migrations, registered clients, signing keys, or the complete
  OAuth flow changes; Docker is required.
- Do not run `:auth:bootRun` without explicit permission.

