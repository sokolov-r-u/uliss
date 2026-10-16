package io.uliss.security.annotation

import io.uliss.security.exception.AuthServerUnavailableException
import org.springframework.core.annotation.AliasFor
import org.springframework.resilience.annotation.Retryable
import kotlin.reflect.KClass

/**
 * Retry policy for calls to the auth server: 3 retries, exponential backoff from 500 ms. The jitter scales with each
 * step and spreads the retries of concurrent callers while auth restarts.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@Retryable(maxRetries = 3, delay = 500, multiplier = 2.0, jitter = 100)
internal annotation class RetryAuthServerCall(
    @get:AliasFor(annotation = Retryable::class, attribute = "includes")
    val includes: Array<KClass<out Throwable>> = [AuthServerUnavailableException::class],
)
