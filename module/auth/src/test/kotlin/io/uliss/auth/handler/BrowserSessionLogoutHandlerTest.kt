package io.uliss.auth.handler

import io.uliss.auth.service.BrowserSessionLogoutService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.server.authorization.oidc.authentication.OidcLogoutAuthenticationToken
import java.time.Instant
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BrowserSessionLogoutHandlerTest {

    private val service = Mockito.mock(BrowserSessionLogoutService::class.java)
    private val handler = BrowserSessionLogoutHandler(service)

    @Test
    fun `revokes the session's authorizations and ends the signed-in browser session`() {
        val httpSession = MockHttpSession()
        val request = MockHttpServletRequest().apply { setSession(httpSession) }

        handler.logout(request, MockHttpServletResponse(), logout(idToken(sid = "sid-1"), signedIn()))

        Mockito.verify(service).revokeAuthorizations("sid-1")
        assertTrue(httpSession.isInvalid)
    }

    @Test
    fun `an ID token without a session revokes nothing but still signs the browser out`() {
        val request = MockHttpServletRequest()
        request.getSession(true)

        handler.logout(request, MockHttpServletResponse(), logout(idToken(sid = null), signedIn()))

        Mockito.verifyNoInteractions(service)
        assertNull(request.getSession(false))
    }

    @Test
    fun `a request without a signed-in browser still revokes by the ID token's session`() {
        val anonymous = AnonymousAuthenticationToken("key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"))

        handler.logout(MockHttpServletRequest(), MockHttpServletResponse(), logout(idToken(sid = "sid-2"), anonymous))

        Mockito.verify(service).revokeAuthorizations("sid-2")
    }

    private fun signedIn() =
        UsernamePasswordAuthenticationToken.authenticated("user", null, AuthorityUtils.createAuthorityList("ROLE_USER"))

    private fun idToken(sid: String?): OidcIdToken = OidcIdToken.withTokenValue("id-token")
        .subject("user")
        .issuedAt(Instant.parse("2026-10-21T10:00:00Z"))
        .expiresAt(Instant.parse("2026-10-21T10:30:00Z"))
        .apply { if (sid != null) claim("sid", sid) }
        .build()

    private fun logout(idToken: OidcIdToken, principal: Authentication) =
        OidcLogoutAuthenticationToken(idToken, principal, null, "client", null, null)
}
