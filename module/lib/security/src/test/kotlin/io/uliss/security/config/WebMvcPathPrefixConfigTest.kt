package io.uliss.security.config

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(properties = ["uliss.web.path-prefix=/svc"])
@AutoConfigureMockMvc
class WebMvcPathPrefixConfigTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `rest controllers are served under the configured prefix`() {
        mockMvc.get("/svc/oauth2/login").andExpect {
            status { is3xxRedirection() }
        }
    }

    @Test
    fun `rest controllers are not served without the prefix`() {
        mockMvc.get("/oauth2/login").andExpect {
            status { isNotFound() }
        }
    }
}
