package io.uliss.exception.config

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.springframework.core.retry.RetryTemplate
import org.springframework.stereotype.Component

@Aspect
@Component
class RetryAspect(val retryTemplate: RetryTemplate) {

    @Around("@annotation(org.springframework.retry.annotation.Retryable)")
    fun retryOnOptimisticLockException(joinPoint: ProceedingJoinPoint): Any = retryTemplate.execute {
        val methodName = joinPoint.signature.name
        val className = joinPoint.signature.declaringType.simpleName
//        todo replace with actual logs
        println("Handling exception during method call ${className}.${methodName}")
        return@execute joinPoint.proceed()
    }
}
