package io.uliss.user_service

import io.uliss.user_service.config.TestContainersConfiguration
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class UserServiceApplicationTests {

	@Test
	fun contextLoads() {
	}

}
