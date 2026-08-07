package io.uliss.validation.validator

import io.uliss.validation.util.MIN_AGE_YEARS
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BirthDateValidatorTest {

    private val validator = BirthDateValidator()

    @Test
    fun `null is valid (optional field)`() {
        assertTrue(validator.isValid(null, null))
    }

    @Test
    fun `exactly min age today is valid`() {
        val date = LocalDate.now().minusYears(MIN_AGE_YEARS.toLong())
        assertTrue(validator.isValid(date, null))
    }

    @Test
    fun `one day short of min age is invalid`() {
        val date = LocalDate.now().minusYears(MIN_AGE_YEARS.toLong()).plusDays(1)
        assertFalse(validator.isValid(date, null))
    }

    @Test
    fun `comfortably older is valid`() {
        val date = LocalDate.now().minusYears(40)
        assertTrue(validator.isValid(date, null))
    }

    @Test
    fun `future date is invalid`() {
        val date = LocalDate.now().plusDays(1)
        assertFalse(validator.isValid(date, null))
    }
}
