package io.uliss.validation.validator

import io.uliss.validation.annotation.BirthDate
import io.uliss.validation.util.MIN_AGE_YEARS
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import java.time.LocalDate

class BirthDateValidator : ConstraintValidator<BirthDate, LocalDate> {

    private var min: Int = MIN_AGE_YEARS

    override fun initialize(constraint: BirthDate) {
        min = constraint.min
    }

    /** null is valid (optional field); the date must be at least `min` years before today. */
    override fun isValid(value: LocalDate?, context: ConstraintValidatorContext?): Boolean {
        if (value == null) return true
        return !value.isAfter(LocalDate.now().minusYears(min.toLong()))
    }
}
