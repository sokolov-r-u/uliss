package io.uliss.logging.config

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.annotation.Pointcut
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

@Aspect
@Component
class LoggingAspect {
    @Pointcut("within(@org.springframework.stereotype.Service *)")
    fun services() {
    }

    @Pointcut("within(@org.springframework.stereotype.Repository *)")
    fun repositories() {
    }

    @Around("services() || repositories()")
    fun aroundServicesAndRepositories(proceedingJoinPoint: ProceedingJoinPoint): Any? {
        var result: Any?
        val className = proceedingJoinPoint.signature.declaringType.simpleName
        val methodName = proceedingJoinPoint.signature.name
        val args = proceedingJoinPoint.args

        val logger = LoggerFactory.getLogger(className)
        logger.debug("Called method '{}.{}' with args {}", className, methodName, args.contentToString())
        try {
            result = proceedingJoinPoint.proceed()
            logger.debug("Method '{}.{}' return value {}", className, methodName, result)
        } catch (ex: Throwable) {
            logger.error("Error occurred during method '{}.{}' ex: {}", className, methodName, ex.message)
            throw ex
        }
        return result
    }
}