package io.uliss.auth.config

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class FormLoginRedirectTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    private val email = "login-redirect-${UUID.randomUUID()}@example.com"

    @BeforeEach
    fun registerUser() {
        mockMvc.post("/register") {
            param("email", email)
            param("password", PASSWORD)
            with(csrf())
        }.andExpect { status { is3xxRedirection() } }
    }

    @Test
    fun `login without a saved request goes to the web app instead of the auth server root`() {
        login(MockHttpSession(), PASSWORD)
            .andExpect { redirectedUrl(FRONTEND_URL) }
    }

    @Test
    fun `login started by authorize returns to the saved authorize request`() {
        val session = MockHttpSession()
        // the authorization endpoint reads its parameters from the query string
        val authorize = "/oauth2/authorize?response_type=code&client_id=test-web-client" +
                "&redirect_uri=$FRONTEND_URL/callback&scope=profile" +
                "&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"
        mockMvc.get(authorize) {
            this.session = session
            accept = MediaType.TEXT_HTML
        }.andExpect { redirectedUrl("/login") }

        val location = login(session, PASSWORD).andReturn().response.redirectedUrl

        assertNotNull(location)
        assertTrue(location.contains("/oauth2/authorize?"), "redirect: $location")
        assertTrue(location.contains("client_id=test-web-client"), "redirect: $location")
    }

    @Test
    fun `wrong password returns to the login form`() {
        login(MockHttpSession(), "wrong-$PASSWORD")
            .andExpect { redirectedUrl("/login?error") }
    }

    private fun login(session: MockHttpSession, password: String) =
        mockMvc.post("/login") {
            this.session = session
            param("username", email)
            param("password", password)
            with(csrf())
        }

    private companion object {
        const val PASSWORD = "1234567!Qq"
        const val FRONTEND_URL = "http://localhost:3000"
    }
}
