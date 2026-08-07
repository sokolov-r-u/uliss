package io.uliss.validation.annotation

import io.uliss.validation.util.BIRTH_DATE_MESSAGE
import io.uliss.validation.util.MIN_AGE_YEARS
import io.uliss.validation.validator.BirthDateValidator
import jakarta.validation.Constraint
import jakarta.validation.Payload
import kotlin.reflect.KClass

@MustBeDocumented
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [BirthDateValidator::class])
annotation class BirthDate(
    val min: Int = MIN_AGE_YEARS,
    val message: String = BIRTH_DATE_MESSAGE,
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = []
)
