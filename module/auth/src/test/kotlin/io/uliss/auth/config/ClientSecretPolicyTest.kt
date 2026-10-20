package io.uliss.auth.config

import kotlin.test.Test
import kotlin.test.assertFailsWith

class ClientSecretPolicyTest {

    @Test
    fun `a short or placeholder client secret stops the start`() {
        listOf("", "password", "a".repeat(31)).forEach { secret ->
            assertFailsWith<IllegalStateException>(secret) { ClientSecretPolicy(secret).check() }
        }
    }

    @Test
    fun `a generated secret passes`() {
        ClientSecretPolicy("0123456789abcdef0123456789abcdef").check()
    }
}
