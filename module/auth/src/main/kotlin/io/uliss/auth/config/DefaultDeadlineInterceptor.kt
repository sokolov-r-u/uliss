package io.uliss.auth.config

import io.grpc.CallOptions
import io.grpc.Channel
import io.grpc.ClientCall
import io.grpc.ClientInterceptor
import io.grpc.MethodDescriptor
import java.time.Duration
import java.util.concurrent.TimeUnit

/** Gives every call without its own deadline a fresh one; a deadline on a stub bean would count from startup. */
class DefaultDeadlineInterceptor(private val timeout: Duration) : ClientInterceptor {

    override fun <Req, Resp> interceptCall(
        method: MethodDescriptor<Req, Resp>,
        callOptions: CallOptions,
        next: Channel,
    ): ClientCall<Req, Resp> {
        val options = if (callOptions.deadline == null) {
            callOptions.withDeadlineAfter(timeout.toMillis(), TimeUnit.MILLISECONDS)
        } else {
            callOptions
        }
        return next.newCall(method, options)
    }
}
