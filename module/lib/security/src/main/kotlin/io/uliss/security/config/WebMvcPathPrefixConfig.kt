package io.uliss.security.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.HandlerTypePredicate
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/**
 * Prefixes every REST controller of the consuming service (own + the auth mediator) with `uliss.web.path-prefix`,
 * so no individual controller repeats it.
 */
@Configuration
@ConditionalOnProperty(PATH_PREFIX_PROPERTY)
class WebMvcPathPrefixConfig(
    @Value("\${$PATH_PREFIX_PROPERTY}") private val pathPrefix: String,
) : WebMvcConfigurer {

    override fun configurePathMatch(configurer: PathMatchConfigurer) {
        configurer.addPathPrefix(pathPrefix, HandlerTypePredicate.forAnnotation(RestController::class.java))
    }
}

const val PATH_PREFIX_PROPERTY = "uliss.web.path-prefix"
