package io.uliss.logging.logger

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import kotlin.reflect.KClass

class AppLogger(private val logger: Logger, private val clazz: KClass<*>) {

    fun debug(method: String, message: () -> String) {
        if (logger.isDebugEnabled) {
            logger.debug("method='{}.{}' message='${message()}'", clazz, method)
        }
    }

    fun info(message: String, method: String, vararg args: Any?) {
        logger.info("method='{}.{}' message='$message'", clazz, method, *args)
    }

    fun warn(message: String, method: String, vararg args: Any?) {
        logger.warn("method='{}.{}' message='$message'", clazz, method, *args)
    }

    fun warn(message: String, method: String, ex: Throwable) {
        logger.warn("method='$clazz.$method' message='$message'", ex)
    }

    fun error(message: String, method: String, vararg args: Any?) {
        logger.error("method='{}.{}' message='$message'", clazz, method, *args)
    }

    fun error(message: String, method: String, ex: Throwable) {
        logger.error("method='$clazz.$method' message='$message'", ex)
    }

    companion object {
        fun of(clazz: KClass<*>) = AppLogger(LoggerFactory.getLogger(clazz.java), clazz)
    }
}


