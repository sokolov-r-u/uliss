package io.uliss.exception.config

import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.Signature
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.retry.backoff.FixedBackOffPolicy
import org.springframework.retry.policy.ExceptionClassifierRetryPolicy
import org.springframework.retry.policy.SimpleRetryPolicy
import org.springframework.retry.support.RetryTemplate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

// RetryConfig's own optimisticLockRetryTemplate() bean relies on @Value defaults that are only
// populated inside a Spring context; built manually here so the retry policy under test
// (maxAttempts, exception classification) is explicit and Spring-independent.
class RetryAspectTest {

    private fun retryTemplate(maxAttempts: Int): RetryTemplate {
        val optimisticLockPolicy = SimpleRetryPolicy()
        optimisticLockPolicy.maxAttempts = maxAttempts

        val classifierPolicy = ExceptionClassifierRetryPolicy()
        classifierPolicy.setPolicyMap(mapOf(ObjectOptimisticLockingFailureException::class.java to optimisticLockPolicy))

        val backOffPolicy = FixedBackOffPolicy()
        backOffPolicy.backOffPeriod = 1

        val template = RetryTemplate()
        template.setRetryPolicy(classifierPolicy)
        template.setBackOffPolicy(backOffPolicy)
        return template
    }

    private fun mockJoinPoint(): ProceedingJoinPoint {
        val joinPoint = Mockito.mock(ProceedingJoinPoint::class.java)
        val signature = Mockito.mock(Signature::class.java)
        Mockito.`when`(joinPoint.signature).thenReturn(signature)
        Mockito.`when`(signature.name).thenReturn("doSomething")
        Mockito.`when`(signature.declaringType).thenReturn(RetryAspectTest::class.java)
        return joinPoint
    }

    @Test
    fun `returns immediately when the first attempt succeeds`() {
        val joinPoint = mockJoinPoint()
        Mockito.`when`(joinPoint.proceed()).thenReturn("ok")
        val aspect = RetryAspect(retryTemplate(maxAttempts = 3))

        val result = aspect.retryOnOptimisticLockException(joinPoint)

        assertEquals("ok", result)
        Mockito.verify(joinPoint, Mockito.times(1)).proceed()
    }

    @Test
    fun `retries on ObjectOptimisticLockingFailureException and returns the eventual result`() {
        val joinPoint = mockJoinPoint()
        Mockito.`when`(joinPoint.proceed())
            .thenThrow(ObjectOptimisticLockingFailureException("TestEntity", 1L))
            .thenThrow(ObjectOptimisticLockingFailureException("TestEntity", 1L))
            .thenReturn("result")
        val aspect = RetryAspect(retryTemplate(maxAttempts = 3))

        val result = aspect.retryOnOptimisticLockException(joinPoint)

        assertEquals("result", result)
        Mockito.verify(joinPoint, Mockito.times(3)).proceed()
    }

    @Test
    fun `propagates the exception once maxAttempts is exhausted`() {
        val joinPoint = mockJoinPoint()
        Mockito.`when`(joinPoint.proceed()).thenThrow(ObjectOptimisticLockingFailureException("TestEntity", 1L))
        val aspect = RetryAspect(retryTemplate(maxAttempts = 2))

        assertFailsWith<ObjectOptimisticLockingFailureException> {
            aspect.retryOnOptimisticLockException(joinPoint)
        }
        Mockito.verify(joinPoint, Mockito.times(2)).proceed()
    }

    @Test
    fun `an exception outside the policy map is not retried`() {
        val joinPoint = mockJoinPoint()
        Mockito.`when`(joinPoint.proceed()).thenThrow(IllegalStateException("boom"))
        val aspect = RetryAspect(retryTemplate(maxAttempts = 5))

        assertFailsWith<IllegalStateException> {
            aspect.retryOnOptimisticLockException(joinPoint)
        }
        Mockito.verify(joinPoint, Mockito.times(1)).proceed()
    }
}
