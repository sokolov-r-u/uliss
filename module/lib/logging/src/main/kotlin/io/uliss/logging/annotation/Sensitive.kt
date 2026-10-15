package io.uliss.logging.annotation

/** Masks the parameter's value in `LoggingAspect` call traces, for secrets whose name does not reveal them. */
@MustBeDocumented
@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
annotation class Sensitive
