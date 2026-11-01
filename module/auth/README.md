# Auth service

`module/auth` (`:auth`, package `io.uliss.auth`) is the OAuth2/OIDC authorization server and the owner of credentials,
registered clients, authorization state, and signing keys.

## Security and clients

`SecurityConfig` defines two filter chains. The first matches every endpoint of the authorization server
(`endpointsMatcher`: `/oauth2/**`, discovery, OIDC `/userinfo` with a bearer access token, `/connect/logout`). The second
handles the application UI, including the custom `/login` and `/register` pages, static `/ds/**` resources, error
handling, and actuator health. Form pages eagerly load the CSRF token so the session exists before a large response
commits.

Authorizations (codes, access and refresh tokens) and consents are stored in the `oauth2_authorization*` JDBC tables
(`AuthServerConfig`), so sessions survive restarts and work across replicas. `AuthorizationCleanupService` deletes
authorizations whose every code and token has expired, daily by `AUTH_AUTHORIZATION_CLEANUP_CRON` (default 03:00).

Registered clients are stored in Spring Authorization Server JDBC tables and seeded by `DataInitializer`; a stored
client that config no longer has is deleted at startup with its authorizations and consents:

- `uliss-web` is confidential, uses HTTP Basic client authentication, Authorization Code, PKCE, and refresh tokens. It
  accepts every URI from `AUTH_CLIENT_CALLBACK_URLS`, and the OIDC end-session endpoint returns only to
  `AUTH_CLIENT_POST_LOGOUT_URLS` (default `FRONTEND_URL/signed-out`). Access tokens last 15 minutes; refresh tokens
  last 30 days and rotate on use. `RefreshGrantPolicy` refuses a refresh for a missing or disabled user and 90 days
  after sign-in; a rotated-out refresh token presented again revokes the whole authorization
  (`ReuseDetectingAuthorizationService`), except one refresh with the token the last rotation replaced within 30
  seconds, which is a client retrying a lost answer and gets a new pair. A refresh whose authorization another refresh
  rotated meanwhile saves nothing and answers 503 `temporarily_unavailable`. `/oauth2/token` logs each request's grant
  type, status and duration (`RequestTimingFilter` from `:logging`, registered in `WebConfig`). End-session removes every authorization signed in through the same browser
  session (the ID token's `sid`, kept in `auth.authorization_session`), so other tabs cannot refresh either.

Config is the source of truth: at startup an existing client is rebuilt from config, keeping only its id and issue time
(stored authorizations reference the id). Grant types, scopes, authentication methods, redirect and logout URIs, and
settings that config does not have are removed; a client already in sync is not rewritten.

Users authenticate by email through `UserService`, with BCrypt password hashing. Their OIDC `sub` is the immutable
`auth.users.id` UUID rather than email. Signing keys are persisted through `SigningKeyEntity` and exposed through the
authorization server's JWKS endpoint.

## User-token enrichment

`TokenConfig` adds roles, `userId`, and an optional `displayName` to user access tokens. It calls user-service over gRPC
with the auth UUID; user-service lazily creates the profile and returns its identifier. A failed user-service call
blocks the token because a token without the profile identity is incomplete; the token endpoint then answers 503
`temporarily_unavailable` (`TokenErrorResponseHandler`), so the code or refresh token stays valid for a retry. Client
Credentials tokens do not use this path.

The gRPC client is configured by `GrpcConfig` from `USER_SERVICE_HOST` and `USER_GRPC_PORT`. Every call carries a
service token from `UserServiceTokenProvider`: a JWT auth signs with its own key (`aud=user-service`, `scope=user.info`,
5 minutes, renewed a minute before expiry; contract in `UserServiceAuth` in `user-api`). Traffic is plaintext inside
the Compose network; TLS is not configured.

## Registration and UI

Registration is handled only by the server-side `GET`/`POST /register` flow. The password never passes through the SPA,
and profile fields remain owned by user-service.

Login and registration render the shared Thymeleaf layout. Both forms are present in one page and tabs switch
client-side. The pages consume CSS and fonts from the `:uliss-design-system` jar at `/ds/**`, pin the login theme,
render
a seeded star field, and disable caching for form pages.

The sign-in/register switch is an accessible tablist: ArrowLeft/ArrowRight changes tabs, the active tab is the only tab
in the normal Tab order, its panel is labelled and hidden semantically, and focus moves to the first field. Buttons and
fields share the design-system focus-visible and reduced-motion rules.

The historical visual source is the external Claude Design project `Uliss Design System`. It is provenance, not a
guaranteed available tool. Exact future comparisons require an accessible MCP integration or an exported reference.

## Configuration and verification

Important environment inputs include the public issuer/authorization URL, internal token/JWKS URL, allowed callback
URLs, frontend URL, client credentials, cookie security, database connection, and user-service gRPC address. See
`infra/env.example.properties` for the concrete names.

```bash
./gradlew :auth:test
./gradlew :auth:integrationTest
```

Integration tests require Docker/Testcontainers. Repository operational limits prohibit starting the application without
explicit permission.
