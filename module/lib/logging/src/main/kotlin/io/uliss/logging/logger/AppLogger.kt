package io.uliss.logging.logger

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import kotlin.reflect.KClass

/**
 * Logs the calling method as a `method` key value, a separate field in structured (JSON) output; the class is
 * already the logger name. `message` is an SLF4J template filled from `args`.
 */
class AppLogger(private val logger: Logger) {

    fun debug(method: String, message: () -> String) {
        if (logger.isDebugEnabled) {
            logger.atDebug().addKeyValue(METHOD, method).log(message())
        }
    }

    fun info(message: String, method: String, vararg args: Any?) {
        logger.atInfo().addKeyValue(METHOD, method).log(message, *args)
    }

    fun warn(message: String, method: String, vararg args: Any?) {
        logger.atWarn().addKeyValue(METHOD, method).log(message, *args)
    }

    fun warn(message: String, method: String, ex: Throwable) {
        logger.atWarn().addKeyValue(METHOD, method).setCause(ex).log(message)
    }

    fun error(message: String, method: String, vararg args: Any?) {
        logger.atError().addKeyValue(METHOD, method).log(message, *args)
    }

    fun error(message: String, method: String, ex: Throwable) {
        logger.atError().addKeyValue(METHOD, method).setCause(ex).log(message)
    }

    companion object {
        private const val METHOD = "method"

        fun of(clazz: KClass<*>) = AppLogger(LoggerFactory.getLogger(clazz.java))
    }
}
