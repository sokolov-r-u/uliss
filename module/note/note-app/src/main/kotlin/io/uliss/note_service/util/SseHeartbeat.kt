package io.uliss.note_service.util

import org.springframework.http.codec.ServerSentEvent
import reactor.core.publisher.Flux
import java.time.Duration

/**
 * Interleaves SSE comment heartbeats so proxies do not cut a quiet stream; heartbeats stop when the source ends.
 * The first one goes out at once: Spring MVC sends the response headers only with the first record.
 * Clients ignore comment-only records.
 */
fun <T : Any> Flux<ServerSentEvent<T>>.withHeartbeat(interval: Duration): Flux<ServerSentEvent<T>> =
    publish { source ->
        val heartbeats = Flux.interval(interval)
            .map { heartbeat<T>() }
            .takeUntilOther(source.then())
        Flux.merge(source, heartbeats)
    }.startWith(heartbeat<T>())

private fun <T : Any> heartbeat(): ServerSentEvent<T> = ServerSentEvent.builder<T>().comment("keepalive").build()
