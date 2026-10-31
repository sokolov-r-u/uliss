package io.uliss.auth.config

import io.uliss.auth.filter.TokenRequestTimingFilter
import io.uliss.auth.interceptor.NoStoreInterceptor
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.time.Clock

@Configuration
class WebConfig : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(NoStoreInterceptor()).addPathPatterns("/login", "/register")
    }

    /** First filter of the token endpoint, so the timing covers client authentication too. */
    @Bean
    fun tokenRequestTimingFilter(clock: Clock): FilterRegistrationBean<TokenRequestTimingFilter> =
        FilterRegistrationBean(TokenRequestTimingFilter(clock)).apply {
            addUrlPatterns("/oauth2/token")
            order = Ordered.HIGHEST_PRECEDENCE
        }
}
