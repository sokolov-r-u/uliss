# logging

Shared logging library for the JVM services (auto-configured, package `io.uliss.logging`).

## Contents

- `AppLogger` — thin SLF4J wrapper; logs the calling method as a `method` key value (a separate field in structured
  JSON output). `message` is an SLF4J template filled from `args`.
- `LoggingAspect` — DEBUG call tracing for `@Service` and `@Repository` beans: one line per call, written when it ends
  (`call` with `args`, `result`, `durationMs`; `call failed` with `args`, `exception`, `durationMs`). Nested calls
  therefore appear innermost first. Active only when the class logger is at DEBUG (`LOG_LEVEL_ULISS=debug`); disable entirely with
  `uliss.logging.aspect.enabled=false`. Values are truncated to 500 characters; reactive results are not rendered.
  A value whose class inherits `Object.toString` prints as `ClassName@identity`, never through its `hashCode`.
- `RequestTimingFilter` — servlet filter logging at INFO one line per request: method, path, the parameters it was
  given as safe, status and duration. Never parameters outside that set, bodies or headers. Not auto-configured: a
  service registers it with a `FilterRegistrationBean` on the paths worth timing (auth: `/oauth2/token`, `grant_type`).
- `ConsoleLogPatternEnvironmentPostProcessor` — default text console pattern with `%kvp`, so key values stay visible
  outside structured logging.

## Secrets in call traces

`LoggingAspect` prints every argument it traces. Mark each parameter that carries a secret with `@Sensitive`; its value
is logged as `***`:

```kotlin
fun exchangeCode(@Sensitive code: String, @Sensitive codeVerifier: String): TokenResponse
```

- The annotation is found on the invoked method or on the interface method it implements.
- `@Sensitive` on a function masks its result (e.g. a method returning a token).
- A fallback regex also masks parameters named like `password`, `secret`, `token`, `verifier`, `privateKey`, `apiKey`,
  `credential`, `cookie`, `jwt`, `otp`, `state` or ending in `code`. It is a safety net, not a substitute for the
  annotation.
- Objects holding secrets (DTOs) must still override `toString` to omit them.
