package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.core.task.TaskExecutor
import java.time.Instant
import java.util.ArrayDeque
import kotlin.test.assertEquals

class OutboxPollerTest {

    private val outboxService = Mockito.mock(OutboxService::class.java)
    private val outboxEventProcessor = Mockito.mock(OutboxEventProcessor::class.java)
    private val taskExecutor = RecordingTaskExecutor()
    private val poller = OutboxPoller(
        outboxService,
        outboxEventProcessor,
        taskExecutor,
        OutboxProperties(concurrency = 2),
    )

    private fun event() = OutboxEventEntity(
        type = OutboxEventType.NOTE_INDEX_REQUESTED,
        payload = """{"noteId":"n"}""",
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    @Test
    fun `poll submits claimed events without processing them on the scheduler thread`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(2)).thenReturn(listOf(first, second))

        poller.poll()

        Mockito.verifyNoInteractions(outboxEventProcessor)
        assertEquals(2, taskExecutor.size)

        taskExecutor.runAll()

        Mockito.verify(outboxEventProcessor).process(first)
        Mockito.verify(outboxEventProcessor).process(second)
    }

    @Test
    fun `poll does not claim more events while all worker slots are occupied`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(2)).thenReturn(listOf(first, second))

        poller.poll()
        poller.poll()

        Mockito.verify(outboxService).claim(2)
    }

    @Test
    fun `completed work releases capacity for the next poll`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(2)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxService.claim(1)).thenReturn(emptyList())

        poller.poll()
        taskExecutor.runNext()
        poller.poll()

        Mockito.verify(outboxService).claim(1)
    }

    @Test
    fun `one worker failure does not prevent another submitted event from running`() {
        val first = event()
        val second = event()
        Mockito.`when`(outboxService.claim(2)).thenReturn(listOf(first, second))
        Mockito.`when`(outboxEventProcessor.process(first)).thenThrow(RuntimeException("db down"))

        poller.poll()
        taskExecutor.runAll()

        Mockito.verify(outboxEventProcessor).process(first)
        Mockito.verify(outboxEventProcessor).process(second)
    }

    @Test
    fun `poll does not record a compensating failure when a handler is missing`() {
        val first = event()
        Mockito.`when`(outboxService.claim(2)).thenReturn(listOf(first))
        Mockito.`when`(outboxEventProcessor.process(first))
            .thenThrow(NoOutboxHandlerException(OutboxEventType.NOTE_INDEX_REQUESTED))

        poller.poll()
        taskExecutor.runAll()

        Mockito.verify(outboxService).claim(2)
        Mockito.verifyNoMoreInteractions(outboxService)
    }

    @Test
    fun `an empty claim releases all capacity`() {
        Mockito.`when`(outboxService.claim(2)).thenReturn(emptyList())

        poller.poll()
        poller.poll()

        Mockito.verifyNoInteractions(outboxEventProcessor)
        Mockito.verify(outboxService, Mockito.times(2)).claim(2)
    }

    private class RecordingTaskExecutor : TaskExecutor {
        private val tasks = ArrayDeque<Runnable>()

        val size: Int
            get() = tasks.size

        override fun execute(task: Runnable) {
            tasks.addLast(task)
        }

        fun runNext() {
            tasks.removeFirst().run()
        }

        fun runAll() {
            while (tasks.isNotEmpty()) runNext()
        }
    }
}
