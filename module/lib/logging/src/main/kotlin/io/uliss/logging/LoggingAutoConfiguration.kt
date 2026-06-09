package io.uliss.logging

import io.uliss.logging.config.LoggingAspect
import io.uliss.logging.config.MeasureTimeAspect
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import

@AutoConfiguration
@Import(LoggingAspect::class, MeasureTimeAspect::class)
class LoggingAutoConfiguration()