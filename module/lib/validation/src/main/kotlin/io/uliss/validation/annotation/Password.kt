package io.uliss.validation.annotation

import io.uliss.exception.utils.ErrorCode
import io.uliss.validation.util.PASSWORD_PATTERN
import jakarta.validation.Constraint
import jakarta.validation.Payload
import jakarta.validation.constraints.Pattern
import kotlin.reflect.KClass

@MustBeDocumented
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [])
@Pattern(regexp = PASSWORD_PATTERN, message = ErrorCode.PASSWORD_FORMAT_ERROR)
annotation class Password(
    val message: String = ErrorCode.PASSWORD_FORMAT_ERROR,
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = []
)
