package io.uliss.validation.annotation

import io.uliss.exception.utils.ErrorCode.EMAIL_FORMAT_ERROR
import io.uliss.validation.util.EMAIL_PATTERN
import jakarta.validation.Constraint
import jakarta.validation.Payload
import jakarta.validation.constraints.Pattern
import kotlin.reflect.KClass

@MustBeDocumented
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Constraint(validatedBy = [])
@Retention(AnnotationRetention.RUNTIME)
@Pattern(regexp = EMAIL_PATTERN, message = EMAIL_FORMAT_ERROR)
annotation class Email(
    val message: String = EMAIL_FORMAT_ERROR,
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = []
)

