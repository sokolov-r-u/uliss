# Security library

`module/lib/security` (`:security`, package `io.uliss.security`) provides shared OAuth2 Resource Server configuration
and a stateless OAuth mediator for user-service, note-service, and future JVM services.

## Resource server

The library validates JWTs against the authorization server's JWKS endpoint. It permits mediator routes in both
unprefixed library tests and one-segment-prefixed consuming applications, permits `/actuator/health`, configures CORS,
and requires authentication elsewhere.

Consuming applications add their own prefix to every `@RestController` through `WebMvcPathPrefixConfig`. As a result,
the library controller declared at `/oauth2` is exposed as `/user/oauth2` in user-service or `/note/oauth2` in
note-service. These mediator routes are distinct from the real authorization server's `/oauth2/authorize`,
`/oauth2/token`, `/oauth2/revoke`, and `/oauth2/jwks` endpoints.

## OAuth mediator

`AuthController` and `AuthService` implement the frontend-facing flow:

1. `GET /user/oauth2/login` creates a PKCE verifier, stores it in an HttpOnly cookie, and redirects the browser to the
   public authorization endpoint.
2. The authorization server returns the browser to the SPA callback.
3. `POST /user/oauth2/callback?code=...` exchanges the code and verifier as the confidential client and returns tokens
   as JSON.
4. `POST /user/oauth2/refresh` performs the refresh grant and returns the rotated token pair.
5. `POST /user/oauth2/logout` performs best-effort refresh-token revocation.

Calls to the authorization server use `RestClient` and retry expected availability failures.

## Split-horizon URLs

The public and internal addresses are intentionally separate:

- `AUTH_PUBLIC_URL` must be reachable by the browser and is used for authorization redirects and issuer-facing
  configuration.
- `AUTH_INTERNAL_URL` must be reachable by services and is used for token exchange, refresh, revocation, and JWKS
  retrieval.

They can be identical in a host/Compose environment and differ behind Kubernetes ingress. The resource server currently
uses the JWKS location without issuer validation.

## SPA token strategy

The React application talks only to relative service URLs and stores access and refresh tokens in `sessionStorage`.
`authFetch` refreshes proactively near expiry and reactively after authentication failure. A failed refresh restarts the
login redirect.

This design keeps services stateless and centralizes OAuth client behavior, but it does not eliminate XSS token theft
because the refresh token remains JavaScript-accessible. Moving tokens to an HttpOnly-cookie BFF requires a shared
gateway or shared state and is deferred.

See `module/auth/README.md` for authorization-server policy and `module/web/README.md` for the SPA implementation once
its migration is complete.

```bash
./gradlew :security:test
```
