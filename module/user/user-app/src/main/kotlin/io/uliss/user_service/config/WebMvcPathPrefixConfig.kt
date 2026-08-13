package io.uliss.user_service.config

import org.springframework.context.annotation.Configuration
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.HandlerTypePredicate
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

// Prefixes every REST controller in this app (own + the :security auth mediator) with /user, so
// no individual controller needs its own path prefix.
@Configuration
class WebMvcPathPrefixConfig : WebMvcConfigurer {

    override fun configurePathMatch(configurer: PathMatchConfigurer) {
        configurer.addPathPrefix("/user", HandlerTypePredicate.forAnnotation(RestController::class.java))
    }
}
