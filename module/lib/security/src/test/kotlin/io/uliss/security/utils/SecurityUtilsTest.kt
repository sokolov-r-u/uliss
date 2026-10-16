package io.uliss.security.utils

import org.junit.jupiter.api.AfterEach
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SecurityUtilsTest {

    @AfterEach
    fun tearDown() {
        RequestContextHolder.resetRequestAttributes()
    }

    @Test
    fun `setCookie sends login cookies only with same-site requests`() {
        val response = MockHttpServletResponse()
        RequestContextHolder.setRequestAttributes(ServletRequestAttributes(MockHttpServletRequest(), response))

        setCookie(CODE_VERIFIER, "verifier", secureCookie = true, maxAge = MAX_COOKIE_AGE)
        setCookie(OAUTH_STATE, "state", secureCookie = true, maxAge = MAX_COOKIE_AGE)

        assertEquals(
            listOf(
                "$CODE_VERIFIER=verifier; Path=/; Max-Age=$MAX_COOKIE_AGE; Secure; HttpOnly; SameSite=Lax",
                "$OAUTH_STATE=state; Path=/; Max-Age=$MAX_COOKIE_AGE; Secure; HttpOnly; SameSite=Lax",
            ),
            response.getHeaders("Set-Cookie").map { it.replace(Regex("; Expires=[^;]+"), "") },
        )
    }

    @Test
    fun `setCookie outside an HTTP request fails with a clear message`() {
        RequestContextHolder.resetRequestAttributes()

        val ex = assertFailsWith<IllegalStateException> {
            setCookie(CODE_VERIFIER, "value", secureCookie = true, maxAge = MAX_COOKIE_AGE)
        }

        assertEquals("cookie $CODE_VERIFIER can only be set while handling an HTTP request", ex.message)
    }
}
