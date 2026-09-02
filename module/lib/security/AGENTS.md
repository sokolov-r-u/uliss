# Security library instructions

Read the repository `AGENTS.md`, this library's `README.md`, and `module/auth/README.md` before changing the OAuth flow.

## Invariants

- `:security` has two roles: JWT resource-server auto-configuration and a stateless OAuth mediator used by consuming
  services.
- Do not confuse mediator endpoints with authorization-server endpoints. The mediator is declared at `/oauth2/**` and
  receives an application prefix such as `/user`; the real authorization server owns its own `/oauth2/**` host paths.
- Preserve stateless service sessions. Access and refresh tokens remain in SPA `sessionStorage` until an explicitly
  scoped BFF/shared-store change is approved.
- Use `AUTH_PUBLIC_URL` only for browser redirects and issuer-facing behavior. Use `AUTH_INTERNAL_URL` for token,
  revocation, and JWKS calls.
- Keep `/oauth2/**`, `/*/oauth2/**`, and `/actuator/health` accessible as documented; protect other application
  endpoints.
- The mediator's value is OAuth encapsulation and confidential-client handling, not XSS protection. Do not claim that
  browser token storage is protected by it.
- Refresh-token rotation and best-effort revocation are part of the current frontend contract.

## Implementation rules

- Keep OAuth HTTP orchestration in `AuthService` and request mapping in `AuthController`; do not put grant logic in
  consuming applications.
- Security configuration, CORS, cookie attributes, retry behavior, and authorization matchers are security-sensitive.
  Changes require explicit scope and focused tests.
- Keep matcher behavior valid both in standalone library tests and under a one-segment consuming-service prefix.
- Avoid request-context `!!`; convert absent request/response state into an explicit failure.
- Do not validate browser behavior by weakening CSRF, CORS, cookie, or JWT checks.

## Verification

- Use `./gradlew :security:test` for mediator, resource-server, CORS, and auditing changes.
- Also test the relevant consuming service when prefixing or auto-configuration behavior changes.
- Do not launch a consuming application or write to a database without explicit permission.

