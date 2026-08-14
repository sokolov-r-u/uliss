package io.uliss.user_service

import org.mockito.ArgumentCaptor
import org.mockito.Mockito

// Mockito.any()/eq()/ArgumentCaptor.capture() return null at runtime. Kotlin inserts a non-null
// assertion when that platform-typed null is passed to a parameter declared non-null in Kotlin,
// or to a Java parameter under Spring's @NonNullApi (this module compiles with -Xjsr305=strict).
// These wrappers suppress that check via an erased cast, same trick mockito-kotlin's any()/eq()/capture() use.

@Suppress("UNCHECKED_CAST")
private fun <T> castNull(): T = null as T

fun <T> anyValue(): T {
    Mockito.any<T>()
    return castNull()
}

// `value: Any?` (not `T`) is deliberate: when T is inferred from an argument of type T instead of
// from the call-site's expected return type, Kotlin inserts a call-site null-check on the result
// anyway, defeating the workaround. Same reason mockito-kotlin's eq() takes T but is only used
// where the compiler infers T from the target parameter, never from the value argument itself.
fun <T> eqValue(value: Any?): T {
    Mockito.eq(value)
    return castNull()
}

fun <T> ArgumentCaptor<T>.captureValue(): T {
    this.capture()
    return castNull()
}

// ArgumentCaptor.forClass(Foo::class.java) returns the raw ArgumentCaptor<Foo>; capturing a
// generic type (e.g. Iterable<Bar>) needs an erased cast.
@Suppress("UNCHECKED_CAST")
fun <T> captorFor(clazz: Class<*>): ArgumentCaptor<T> =
    ArgumentCaptor.forClass(clazz) as ArgumentCaptor<T>
