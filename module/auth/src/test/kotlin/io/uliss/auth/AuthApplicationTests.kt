package io.uliss.auth

import io.uliss.auth.config.TestContainersConfiguration
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import

@SpringBootTest
@Import(TestContainersConfiguration::class)
class AuthApplicationTests {

	@Test
	fun contextLoads() {
	}

}
