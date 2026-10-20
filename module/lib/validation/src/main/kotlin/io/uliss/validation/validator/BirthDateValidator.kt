package io.uliss.validation.validator

import io.uliss.validation.annotation.BirthDate
import io.uliss.validation.util.MAX_AGE_YEARS
import io.uliss.validation.util.MIN_AGE_YEARS
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import java.time.Clock
import java.time.LocalDate

class BirthDateValidator : ConstraintValidator<BirthDate, LocalDate> {

    private var min: Int = MIN_AGE_YEARS

    override fun initialize(constraint: BirthDate) {
        min = constraint.min
    }

    /**
     * null is valid (optional field); the date must be at least `min` years before today and not more than
     * [MAX_AGE_YEARS] (older dates are typos, some not even storable). Today comes from the validator's clock provider.
     */
    override fun isValid(value: LocalDate?, context: ConstraintValidatorContext?): Boolean {
        if (value == null) return true
        val today = LocalDate.now(context?.clockProvider?.clock ?: Clock.systemDefaultZone())
        return !value.isAfter(today.minusYears(min.toLong())) && value.isAfter(today.minusYears(MAX_AGE_YEARS.toLong()))
    }
}
