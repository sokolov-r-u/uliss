package io.uliss.logging.config

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.annotation.Pointcut
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Pre-production call tracing for services and repositories at DEBUG: arguments by name (secrets masked), results,
 * and a one-line exit on exception. Stack traces are logged once by the exception handler, never here.
 * Disable with `uliss.logging.aspect.enabled=false`.
 */
@Aspect
@Component
@ConditionalOnProperty(name = ["uliss.logging.aspect.enabled"], havingValue = "true", matchIfMissing = true)
class LoggingAspect {
    @Pointcut("within(@org.springframework.stereotype.Service *)")
    fun services() {
    }

    @Pointcut("within(@org.springframework.stereotype.Repository *)")
    fun repositories() {
    }

    @Around("services() || repositories()")
    fun aroundServicesAndRepositories(proceedingJoinPoint: ProceedingJoinPoint): Any? {
        val signature = proceedingJoinPoint.signature
        val logger = LoggerFactory.getLogger(signature.declaringType)
        if (!logger.isDebugEnabled) return proceedingJoinPoint.proceed()

        val method = "${signature.declaringType.simpleName}.${signature.name}"
        logger.debug("call method='{}' with args='{}'", method, renderArgs(proceedingJoinPoint))
        val result = try {
            proceedingJoinPoint.proceed()
        } catch (ex: Throwable) {
            logger.debug("exit method='{}' with exception='{}'", method, ex.javaClass.simpleName)
            throw ex
        }
        logger.debug("finish method='{}' return value='{}'", method, renderResult(result))
        return result
    }

    private fun renderArgs(joinPoint: ProceedingJoinPoint): String {
        val names = (joinPoint.signature as? MethodSignature)?.parameterNames
        return joinPoint.args.withIndex().joinToString(", ") { (index, value) ->
            val name = names?.getOrNull(index) ?: "arg$index"
            "$name=${if (SECRET_NAME.containsMatchIn(name)) MASK else truncate(value.toString())}"
        }
    }

    /** A reactive result is only a handle: its data and errors arrive after this method returns. */
    private fun renderResult(result: Any?): String =
        if (result != null && result.javaClass.name.startsWith(REACTOR_PACKAGE)) "<reactive stream>"
        else truncate(result.toString())

    private fun truncate(text: String): String =
        if (text.length <= MAX_VALUE_LENGTH) text
        else "${text.take(MAX_VALUE_LENGTH)}…(${text.length} chars)"

    private companion object {
        const val MAX_VALUE_LENGTH = 500
        const val MASK = "***"
        const val REACTOR_PACKAGE = "reactor.core.publisher."
        val SECRET_NAME = Regex("password|secret|token|verifier|privatekey|apikey", RegexOption.IGNORE_CASE)
    }
}
