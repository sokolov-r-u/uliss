package io.uliss.logging.config

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import kotlin.system.measureTimeMillis

@Aspect
@Component
class MeasureTimeAspect {

    @Around("@annotation(io.uliss.logging.annotation.MeasureTime)")
    fun measure(proceedingJoinPoint: ProceedingJoinPoint): Any? {
        var result: Any?
        val className = proceedingJoinPoint.signature.declaringType.simpleName
        val methodName = proceedingJoinPoint.signature.name
        val logger = LoggerFactory.getLogger(className)
        val elapsed = measureTimeMillis {
            result = proceedingJoinPoint.proceed()
        }
        logger.debug("Method '{}.{}' executionTime {}", className, methodName, elapsed)
        return result
    }
}