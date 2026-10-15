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
        val signature = proceedingJoinPoint.signature
        // Full class name, so the logger falls under the io.uliss level settings.
        val logger = LoggerFactory.getLogger(signature.declaringType)
        val elapsed = measureTimeMillis {
            result = proceedingJoinPoint.proceed()
        }
        logger.atDebug().addKeyValue("method", signature.name).addKeyValue("elapsed_ms", elapsed).log("execution time")
        return result
    }
}