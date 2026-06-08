package io.uliss.exception

import io.uliss.exception.config.RetryAspect
import io.uliss.exception.config.RetryConfig
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import
import org.springframework.retry.annotation.EnableRetry

@AutoConfiguration
@EnableRetry
@Import(RetryConfig::class, RetryAspect::class)
class ExceptionAutoConfiguration