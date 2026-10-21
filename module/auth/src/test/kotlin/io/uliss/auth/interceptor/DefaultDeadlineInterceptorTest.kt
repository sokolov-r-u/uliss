package io.uliss.auth.interceptor

import io.grpc.CallOptions
import io.grpc.Channel
import io.grpc.ClientCall
import io.grpc.Deadline
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.uliss.api.user.v1.UserServiceGrpc
import java.time.Duration
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DefaultDeadlineInterceptorTest {

    private val interceptor = DefaultDeadlineInterceptor(Duration.ofSeconds(3))

    @Test
    fun `each call gets a fresh deadline`() {
        val channel = CapturingChannel()

        interceptor.interceptCall(UserServiceGrpc.getGetUserInfoMethod(), CallOptions.DEFAULT, channel)

        val deadline = assertNotNull(channel.options?.deadline)
        val remainingMs = deadline.timeRemaining(TimeUnit.MILLISECONDS)
        assertTrue(remainingMs in 2_000..3_000, "remaining=$remainingMs")
    }

    @Test
    fun `an explicit caller deadline is kept`() {
        val channel = CapturingChannel()
        val explicit = Deadline.after(10, TimeUnit.SECONDS)

        interceptor.interceptCall(
            UserServiceGrpc.getGetUserInfoMethod(),
            CallOptions.DEFAULT.withDeadline(explicit),
            channel,
        )

        assertEquals(explicit, channel.options?.deadline)
    }

    private class CapturingChannel : Channel() {
        var options: CallOptions? = null

        override fun <Req, Resp> newCall(method: MethodDescriptor<Req, Resp>, callOptions: CallOptions): ClientCall<Req, Resp> {
            options = callOptions
            return NoopCall()
        }

        override fun authority(): String = "test"
    }

    private class NoopCall<Req, Resp> : ClientCall<Req, Resp>() {
        override fun start(responseListener: Listener<Resp>, headers: Metadata) = Unit
        override fun request(numMessages: Int) = Unit
        override fun cancel(message: String?, cause: Throwable?) = Unit
        override fun halfClose() = Unit
        override fun sendMessage(message: Req) = Unit
    }
}
