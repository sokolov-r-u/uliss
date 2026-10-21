package io.uliss.auth.config

import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/** Refuses to start with a guessable web client secret, such as a placeholder copied from an example file. */
@Component
class ClientSecretPolicy(
    @Value($$"${app.clients.authorization-code.client-secret}") private val webClientSecret: String,
) {
    @PostConstruct
    fun check() {
        check(webClientSecret.length >= MIN_LENGTH) {
            "the web client secret must have at least $MIN_LENGTH characters; generate one, e.g. openssl rand -hex 32"
        }
    }

    private companion object {
        const val MIN_LENGTH = 32
    }
}
