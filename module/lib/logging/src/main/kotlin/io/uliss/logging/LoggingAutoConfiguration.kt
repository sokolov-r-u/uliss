package io.uliss.logging

import io.uliss.logging.config.LoggingAspect
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import

@AutoConfiguration
@Import(LoggingAspect::class)
class LoggingAutoConfiguration()