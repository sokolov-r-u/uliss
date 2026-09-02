# Auth service

`module/auth` (`:auth`, package `io.uliss.auth`) is the OAuth2/OIDC authorization server and the owner of credentials,
registered clients, authorization state, and signing keys.

## Security and clients

`SecurityConfig` defines two filter chains. The first matches authorization-server and discovery endpoints. The second
handles the application UI, including the custom `/login` and `/register` pages, static `/ds/**` resources, error
handling, and actuator health. Form pages eagerly load the CSRF token so the session exists before a large response
commits.

Registered clients are stored in Spring Authorization Server JDBC tables and seeded by `DataInitializer`:

- `uliss-web` is confidential, uses HTTP Basic client authentication, Authorization Code, PKCE, and refresh tokens. It
  accepts every URI from `AUTH_CLIENT_CALLBACK_URLS`. Access tokens last 15 minutes; refresh tokens last 30 days and
  rotate on use. Startup appends newly configured callback URIs to an existing client.
- `uliss-internal` uses Client Credentials with the `internal` scope for service traffic.

Users authenticate by email through `UserService`, with BCrypt password hashing. Their OIDC `sub` is the immutable
`auth.users.id` UUID rather than email. Signing keys are persisted through `SigningKeyEntity` and exposed through the
authorization server's JWKS endpoint.

## User-token enrichment

`TokenConfig` adds roles, `userId`, and an optional `displayName` to user access tokens. It calls user-service over gRPC
with the auth UUID; user-service lazily creates the profile and returns its identifier. A failed user-service call
blocks user login because a token without the profile identity is incomplete. Client Credentials tokens do not use this
path.

The gRPC client is configured by `GrpcConfig` from `USER_SERVICE_HOST` and `USER_GRPC_PORT`. It is plaintext internal
traffic today; transport hardening remains deferred work.

## Registration and UI

Registration is handled only by the server-side `GET`/`POST /register` flow. The password never passes through the SPA,
and profile fields remain owned by user-service.

Login and registration render the shared Thymeleaf layout. Both forms are present in one page and tabs switch
client-side. The pages consume CSS and assets from the `:uliss-design-system` jar at `/ds/**`, pin the login theme,
render a seeded star field, and disable caching for form pages.

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

