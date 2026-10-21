package io.uliss.security.config

import org.springframework.boot.security.oauth2.server.resource.autoconfigure.JwkSetUriJwtDecoderBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestTemplate
import java.net.http.HttpClient
import java.time.Duration

/**
 * The signing keys are fetched from the auth server with the timeouts of every other call to it. Nimbus's default
 * 500 ms read timeout rejects a valid token whenever a cold or busy auth server answers the key set more slowly.
 */
@Configuration(proxyBeanMethods = false)
class JwkSetClientConfig {

    @Bean
    fun jwkSetClientTimeouts(): JwkSetUriJwtDecoderBuilderCustomizer = JwkSetUriJwtDecoderBuilderCustomizer { builder ->
        val requestFactory = JdkClientHttpRequestFactory(
            HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(3))
                .build()
        ).apply { setReadTimeout(Duration.ofSeconds(5)) }
        builder.restOperations(RestTemplate(requestFactory))
    }
}
