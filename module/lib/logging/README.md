# logging

Shared logging library for the JVM services (auto-configured, package `io.uliss.logging`).

## Contents

- `AppLogger` — thin SLF4J wrapper; logs the calling method as a `method` key value (a separate field in structured
  JSON output). `message` is an SLF4J template filled from `args`.
- `LoggingAspect` — DEBUG call tracing for `@Service` and `@Repository` beans: one line per call, written when it ends
  (`call` with `args`, `result`, `durationMs`; `call failed` with `args`, `exception`, `durationMs`). Nested calls
  therefore appear innermost first. Active only when the class logger is at DEBUG (`LOG_LEVEL_ULISS=debug`); disable entirely with
  `uliss.logging.aspect.enabled=false`. Values are truncated to 500 characters; reactive results are not rendered.
- `@MeasureTime` — logs a method's execution time at DEBUG.
- `ConsoleLogPatternEnvironmentPostProcessor` — default text console pattern with `%kvp`, so key values stay visible
  outside structured logging.

## Secrets in call traces

`LoggingAspect` prints every argument it traces. Mark each parameter that carries a secret with `@Sensitive`; its value
is logged as `***`:

```kotlin
fun exchangeCode(@Sensitive code: String, @Sensitive codeVerifier: String): TokenResponse
```

- Annotate on the method that is actually invoked through the proxy: for a bean called through an interface, put it on
  the interface method's parameter.
- A fallback regex also masks parameters named like `password`, `secret`, `token`, `verifier`, `privateKey`, `apiKey`.
  It is a safety net, not a substitute for the annotation.
- `@Sensitive` covers parameters only. Objects holding secrets (DTOs, results) must override `toString` to omit them.
