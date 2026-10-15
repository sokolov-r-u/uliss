package io.uliss.exception

import io.uliss.exception.handler.GlobalExceptionHandler
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import

@AutoConfiguration
@Import(GlobalExceptionHandler::class)
class ExceptionAutoConfiguration
