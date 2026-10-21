package io.uliss.logging.annotation

/**
 * Masks a value in `LoggingAspect` call traces: on a parameter, its argument; on a function, its result. Found on the
 * invoked method or the interface method it implements.
 */
@MustBeDocumented
@Target(AnnotationTarget.VALUE_PARAMETER, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Sensitive
