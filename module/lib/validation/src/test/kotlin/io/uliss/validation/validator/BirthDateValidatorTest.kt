package io.uliss.validation.validator

import io.uliss.validation.annotation.BirthDate
import jakarta.validation.Validation
import jakarta.validation.Validator
import org.hibernate.validator.HibernateValidator
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BirthDateValidatorTest {

    private class Profile(@field:BirthDate val birthDate: LocalDate?)

    private fun validatorOn(today: String): Validator = Validation.byProvider(HibernateValidator::class.java)
        .configure()
        .clockProvider { Clock.fixed(Instant.parse("${today}T12:00:00Z"), ZoneOffset.UTC) }
        .buildValidatorFactory()
        .validator

    private fun violations(today: String, birthDate: String?) =
        validatorOn(today).validate(Profile(birthDate?.let(LocalDate::parse)))

    @Test
    fun `null is valid (optional field)`() {
        assertTrue(violations("2026-10-21", null).isEmpty())
    }

    @Test
    fun `exactly the minimum age today is valid`() {
        assertTrue(violations("2026-10-21", "2010-10-21").isEmpty())
    }

    @Test
    fun `one day short of the minimum age is invalid`() {
        assertEquals(1, violations("2026-10-21", "2010-10-22").size)
    }

    @Test
    fun `someone born on 29 February comes of age on 28 February of a common year`() {
        assertTrue(violations("2026-02-28", "2010-02-28").isEmpty())
        assertEquals(1, violations("2024-02-28", "2008-02-29").size)
        assertTrue(violations("2024-02-29", "2008-02-29").isEmpty())
    }

    @Test
    fun `future date is invalid`() {
        assertEquals(1, violations("2026-10-21", "2026-10-22").size)
    }

    @Test
    fun `an implausibly old date is invalid`() {
        // a year the database cannot store (-5000) or no living person has
        assertEquals(1, violations("2026-10-21", "1870-01-01").size)
        assertEquals(1, violations("2026-10-21", "-5000-01-01").size)
    }

    @Test
    fun `the message names the configured minimum age`() {
        assertEquals("You must be at least 16 years old.", violations("2026-10-21", "2026-01-01").single().message)
    }
}
