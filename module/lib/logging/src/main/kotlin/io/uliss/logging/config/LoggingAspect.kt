package io.uliss.logging.config

import io.uliss.logging.annotation.Sensitive
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.annotation.Pointcut
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Pre-production call tracing for services and repositories at DEBUG: arguments by name (secrets and [Sensitive] parameters masked), results,
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

        // The class is the logger name; method, args and result are separate fields in structured output.
        val method = signature.name
        logger.atDebug().addKeyValue("method", method).addKeyValue("args", renderArgs(proceedingJoinPoint)).log("call")
        val result = try {
            proceedingJoinPoint.proceed()
        } catch (ex: Throwable) {
            logger.atDebug().addKeyValue("method", method).addKeyValue("exception", ex.javaClass.simpleName).log("exit")
            throw ex
        }
        logger.atDebug().addKeyValue("method", method).addKeyValue("result", renderResult(result)).log("finish")
        return result
    }

    /** Masks a parameter that is annotated [Sensitive] or whose name looks like a secret. */
    private fun renderArgs(joinPoint: ProceedingJoinPoint): String {
        val signature = joinPoint.signature as? MethodSignature
        val names = signature?.parameterNames
        val parameters = signature?.method?.parameters
        return joinPoint.args.withIndex().joinToString(", ") { (index, value) ->
            val name = names?.getOrNull(index) ?: "arg$index"
            val sensitive = parameters?.getOrNull(index)?.isAnnotationPresent(Sensitive::class.java) == true
            "$name=${if (sensitive || SECRET_NAME.containsMatchIn(name)) MASK else render(value)}"
        }
    }

    /** A reactive result is only a handle: its data and errors arrive after this method returns. */
    private fun renderResult(result: Any?): String =
        if (result != null && result.javaClass.name.startsWith(REACTOR_PACKAGE)) "<reactive stream>"
        else render(result)

    /**
     * Args arrive as platform types, so a plain `value.toString()` NPEs on null; tracing must never break the call,
     * so a throwing `toString` is reported instead of propagated.
     */
    private fun render(value: Any?): String =
        try {
            truncate(value?.toString() ?: "null")
        } catch (ex: Exception) {
            "<unrenderable: ${ex.javaClass.simpleName}>"
        }

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
