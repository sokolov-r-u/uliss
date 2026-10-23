package io.uliss.note_service.util

import org.springframework.http.codec.ServerSentEvent
import reactor.core.publisher.Flux
import reactor.core.publisher.Sinks
import reactor.test.StepVerifier
import java.time.Duration
import kotlin.test.Test

class SseHeartbeatTest {

    @Test
    fun `a heartbeat opens the stream at once`() {
        // Spring MVC sends the response headers (e.g. Chat-Turn-Id) only with the first record
        StepVerifier.withVirtualTime { Flux.never<ServerSentEvent<String>>().withHeartbeat(Duration.ofSeconds(15)) }
            .expectSubscription()
            .expectNextMatches { it.comment() == "keepalive" }
            .thenCancel()
            .verify(Duration.ofSeconds(5))
    }

    @Test
    fun `quiet stream gets heartbeat comments and ends with its source`() {
        StepVerifier.withVirtualTime {
            val source = Sinks.many().unicast().onBackpressureBuffer<ServerSentEvent<String>>()
            Flux.interval(Duration.ofSeconds(40)).take(1).subscribe {
                source.tryEmitNext(ServerSentEvent.builder("ready").event("status").build())
                source.tryEmitComplete()
            }
            source.asFlux().withHeartbeat(Duration.ofSeconds(15))
        }
            .expectSubscription()
            .expectNextMatches { it.comment() == "keepalive" && it.data() == null }
            .thenAwait(Duration.ofSeconds(15))
            .expectNextMatches { it.comment() == "keepalive" }
            .thenAwait(Duration.ofSeconds(15))
            .expectNextMatches { it.comment() == "keepalive" }
            .thenAwait(Duration.ofSeconds(10))
            .expectNextMatches { it.data() == "ready" }
            .expectComplete()
            .verify(Duration.ofSeconds(5))
    }

    @Test
    fun `source errors are propagated`() {
        StepVerifier.withVirtualTime {
            Flux.error<ServerSentEvent<String>>(IllegalStateException("boom")).withHeartbeat(Duration.ofSeconds(15))
        }
            .expectNextMatches { it.comment() == "keepalive" }
            .verifyErrorMessage("boom")
    }
}
