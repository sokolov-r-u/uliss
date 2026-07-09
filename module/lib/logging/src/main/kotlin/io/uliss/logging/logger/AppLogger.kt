package io.uliss.logging.logger

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import kotlin.reflect.KClass

class AppLogger(private val logger: Logger, private val clazz: KClass<*>) {

    fun debug(message: String, method: String) {
        logger.debug("method='{}.{}' message={}", clazz, method, message)
    }

    fun info(message: String, method: String) {
        logger.info("method='{}.{}' message={}", clazz, method, message)
    }

    fun warn(message: String, method: String) {
        logger.warn("method='{}.{}' message={}", clazz, method, message)
    }

    fun error(message: String, method: String) {
        logger.error("method='{}.{}' message={}", clazz, method, message)

    }

    companion object {
        fun of(clazz: KClass<*>) = AppLogger(LoggerFactory.getLogger(clazz.java), clazz)
    }
}


