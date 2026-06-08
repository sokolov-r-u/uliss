package io.uliss.exception.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.retry.backoff.FixedBackOffPolicy
import org.springframework.retry.policy.ExceptionClassifierRetryPolicy
import org.springframework.retry.policy.SimpleRetryPolicy
import org.springframework.retry.support.RetryTemplate

@Configuration
class RetryConfig {

    @Value($$"${exception.retry:10}")
    private val numberOfAttempts: Int = 0

    @Value($$"${exception.back-off-time:100}")
    private val backOffPeriod: Long = 0

    @Bean
    fun retryTemplate(): RetryTemplate {
        val optimisticLockRetryPolicy = SimpleRetryPolicy()
        optimisticLockRetryPolicy.maxAttempts = numberOfAttempts

        val retryPolicy = ExceptionClassifierRetryPolicy()
        retryPolicy.setPolicyMap(mapOf(ObjectOptimisticLockingFailureException::class.java to optimisticLockRetryPolicy))

        val backOffPolicy = FixedBackOffPolicy()
        backOffPolicy.backOffPeriod = backOffPeriod

        val retryTemplate = RetryTemplate()
        retryTemplate.setRetryPolicy(retryPolicy)
        retryTemplate.setBackOffPolicy(backOffPolicy)

        return retryTemplate
    }
}