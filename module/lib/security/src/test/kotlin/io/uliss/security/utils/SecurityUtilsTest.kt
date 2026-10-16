package io.uliss.security.utils

import org.springframework.web.context.request.RequestContextHolder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SecurityUtilsTest {

    @Test
    fun `setCookie outside an HTTP request fails with a clear message`() {
        RequestContextHolder.resetRequestAttributes()

        val ex = assertFailsWith<IllegalStateException> {
            setCookie(CODE_VERIFIER, "value", secureCookie = true, maxAge = MAX_COOKIE_AGE)
        }

        assertEquals("cookie $CODE_VERIFIER can only be set while handling an HTTP request", ex.message)
    }
}
