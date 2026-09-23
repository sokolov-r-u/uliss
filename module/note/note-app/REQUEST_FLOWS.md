# Note service request flows

This document describes the current request paths in `:note`. It focuses on call order,
transaction boundaries, durable state, and external AI calls. All controller routes below receive
the `/note` prefix from `WebMvcPathPrefixConfig`.

## Component map

```mermaid
flowchart LR
    Client[Web client]

    subgraph HTTP[HTTP layer]
        ChatController
        NoteController
    end

    subgraph Application[Application layer]
        ChatFacade
        ChatService
        AssistantService
        ChatTurnService
        NoteService
        RagService
    end

    subgraph Async[Outbox processing]
        OutboxPoller
        OutboxEventProcessor
        SummaryHandler[NoteSummaryRequestedHandler]
        IndexHandler[NoteIndexRequestedHandler]
    end

    subgraph Persistence[PostgreSQL]
        ChatTables[(chat / chat_message / chat_turn)]
        NoteTables[(notes / chat_note / summary_request)]
        OutboxTable[(outbox_event)]
        RagChunks[(rag_chunks)]
    end

    ChatModel[ChatClient / DeepSeek]
    EmbeddingModel[EmbeddingModel / OpenAI]
    Client --> ChatController --> ChatFacade
    Client --> NoteController --> NoteService
    ChatFacade --> ChatService --> ChatTables
    ChatFacade --> AssistantService --> ChatTurnService --> ChatTables
    ChatFacade --> NoteService --> NoteTables
    NoteService --> OutboxTable
    AssistantService --> ChatModel
    OutboxPoller --> OutboxEventProcessor
    OutboxEventProcessor --> SummaryHandler
    OutboxEventProcessor --> IndexHandler
    SummaryHandler --> ChatService
    SummaryHandler --> RagService
    SummaryHandler --> ChatModel
    SummaryHandler --> NoteService
    IndexHandler --> RagService
    RagService --> EmbeddingModel
    RagService --> RagChunks
```

The controllers map authentication and transport data. `ChatFacade` coordinates use cases that
span chat, assistant, and note services. Repositories and JDBC stores are reached only from the
application services or outbox handlers.

## Endpoint routing

| Request                                           | Synchronous call path                                                 | Result                                             |
|---------------------------------------------------|-----------------------------------------------------------------------|----------------------------------------------------|
| `POST /note/chats`                                | `ChatController -> ChatFacade -> ChatService`                         | Creates an owned chat                              |
| `GET /note/chats`                                 | `ChatController -> ChatFacade -> ChatService`                         | Lists the user's chats                             |
| `GET /note/chats/{chatId}/messages`               | `ChatController -> ChatFacade -> ChatService`                         | Returns ownership-filtered history                 |
| `POST /note/chats/{chatId}/messages/stream`       | `ChatController -> ChatFacade -> AssistantService -> ChatTurnService` | Reserves or replays a turn, then returns SSE       |
| `POST /note/chats/{chatId}/turns/{turnId}/cancel` | `ChatController -> ChatFacade -> AssistantService -> ChatTurnService` | Cancels an active turn                             |
| `POST /note/chats/{chatId}/summarize`             | `ChatController -> ChatFacade -> ChatService + NoteService`           | Creates or replays an asynchronous summary request |
| `GET /note/notes`                                 | `NoteController -> NoteService`                                       | Lists the user's notes                             |
| `GET /note/notes/{noteId}`                        | `NoteController -> NoteService`                                       | Returns an ownership-filtered note                 |
| `GET /note/notes/{noteId}/status/stream`          | `NoteController -> NoteService`                                       | Streams persisted note status changes              |

## Streamed chat turn

The client generates an `Idempotency-Key` for one logical send and retains it while that operation
is unresolved. PostgreSQL scopes this key to the chat. The backend separately generates the
`chat_turn.id`, returns it in `Chat-Turn-Id`, and stores it on the turn's USER and ASSISTANT
messages. The server also calculates a SHA-256 request fingerprint from the fingerprint format
version and the exact UTF-8 prompt bytes. The fingerprint prevents the same client key from being
reused for different input in the same chat.

```mermaid
sequenceDiagram
    autonumber
    participant C as Web client
    participant HC as ChatController
    participant F as ChatFacade
    participant A as AssistantService
    participant L as ChatTurnService
    participant TS as ChatTurnStore
    participant MR as ChatMessageRepository
    participant AI as ChatClient
    C ->> HC: POST messages/stream<br/>Idempotency-Key = client key
    HC ->> F: streamMessage(userId, chatId, idempotencyKey, prompt)
    F ->> A: streamReply(...)
    A ->> L: resolveTurnRequest(...)

    rect rgb(235, 245, 255)
        Note over L, MR: Transaction 1: reserve or resolve the turn
        L ->> TS: lockOwnedChat(userId, chatId)
        L ->> TS: findByIdempotencyKey(userId, chatId, idempotencyKey)
        alt New turn
            L ->> TS: findGenerating(userId, chatId)
            L ->> TS: insert backend turn ID<br/>GENERATING, attempt = 1, lease_until set
            L ->> MR: load prior history
            L ->> MR: save COMPLETE user message
            L -->> A: StartGeneration(turn, history)
        else Existing GENERATING turn with a live lease
            L -->> A: AlreadyGenerating(retryAfterMs)
        else Existing terminal turn
            L -->> A: AlreadyFinished(status)
        else Expired GENERATING turn
            L ->> TS: claimExpired<br/>attempt + 1, renew lease
            L ->> MR: reload persisted history
            L -->> A: StartGeneration(turn, history)
        end
    end

    alt StartGeneration
        Note over A, AI: No database transaction is held during provider streaming
        A ->> AI: prompt(history).stream()
        loop Provider text chunks
            AI -->> A: text chunk
            A -->> HC: AppendText
            HC -->> C: event: append
        end

        rect rgb(235, 245, 255)
            Note over L, MR: Transaction 2: fenced finalization
            A ->> L: finishGenerationAttempt(turnId, attempt, content, status)
            L ->> TS: GENERATING -> COMPLETE / PARTIAL / FAILED<br/>only for the same attempt
            L ->> MR: save assistant message
        end
        A -->> HC: GenerationCompleted
        HC -->> C: 200 + echoed Idempotency-Key<br/>Chat-Turn-Id = backend turn ID<br/>event: done
    else AlreadyGenerating
        A -->> HC: GenerationPending(retryAfterMs)
        HC -->> C: same headers<br/>event: pending
    else AlreadyFinished
        A -->> HC: completed or failed replay event
        HC -->> C: same headers<br/>event: done or error
    end
```

Important behavior:

- The owned chat row is locked only while reserving or resolving a turn. The lock is released before
  the provider call.
- Only one `GENERATING` turn is allowed per chat. A different idempotency key while one is active
  produces `CHAT_TURN_ACTIVE`.
- Reusing an idempotency key with different prompt content in the same chat produces
  `IDEMPOTENCY_KEY_REUSED`. The same key in another chat is an independent operation.
- A live lease returns `pending`; an expired lease may be reclaimed with a higher attempt number.
- Finalization is fenced by `turnId + userId + chatId + attempt + GENERATING`. A late provider result
  cannot overwrite a cancellation or the result of a newer attempt.
- A completed replay emits the terminal event but does not replay old text chunks. The client
  reconciles the durable assistant message from chat history.
- The SPA uses `Chat-Turn-Id` for history reconciliation and cancellation. It uses the client key
  only to retry the same unresolved send.
- Provider completion becomes `COMPLETE`. An interruption after some text becomes `PARTIAL`; an
  interruption before any text becomes `FAILED`.

### Chat turn states

```mermaid
stateDiagram-v2
    [*] --> GENERATING: reserve attempt 1
    GENERATING --> GENERATING: lease expired / claim next attempt
    GENERATING --> COMPLETE: provider completed and result persisted
    GENERATING --> PARTIAL: interrupted after receiving text
    GENERATING --> FAILED: interrupted without text
    GENERATING --> FAILED: expired at maximum attempts
    GENERATING --> CANCELED: explicit cancellation
    COMPLETE --> [*]
    PARTIAL --> [*]
    FAILED --> [*]
    CANCELED --> [*]
```

## Explicit chat-turn cancellation

```mermaid
sequenceDiagram
    autonumber
    participant C as Web client
    participant HC as ChatController
    participant F as ChatFacade
    participant A as AssistantService
    participant L as ChatTurnService
    participant TS as ChatTurnStore
    participant MR as ChatMessageRepository
    C ->> HC: POST chats/{chatId}/turns/{turnId}/cancel
    HC ->> F: cancelTurn(userId, chatId, turnId)
    F ->> A: cancelTurn(...)
    A ->> L: cancelTurn(...)
    rect rgb(235, 245, 255)
        Note over L, MR: One short transaction
        L ->> TS: lockOwnedChat(userId, chatId)
        L ->> TS: findById(userId, turnId)
        alt Status is GENERATING
            L ->> TS: GENERATING -> CANCELED
            L ->> MR: save empty CANCELED assistant message
        else Status is already terminal
            Note over L: Return the existing turn without changing it
        end
    end
    HC -->> C: 204 No Content
```

The cancellation changes durable state; it does not directly terminate the provider's network
request. Attempt fencing prevents a provider result that arrives later from changing the canceled
turn.

## Asynchronous chat summary request

The summary `Idempotency-Key` is scoped by `userId`. The request thread does not call a model.

```mermaid
sequenceDiagram
    autonumber
    participant C as Web client
    participant HC as ChatController
    participant F as ChatFacade
    participant CS as ChatService
    participant NS as NoteService
    participant SR as SummaryRequestStore
    participant NR as NoteRepository
    participant CR as ChatNoteRepository
    participant OS as OutboxService
    C ->> HC: POST chats/{chatId}/summarize<br/>Idempotency-Key
    HC ->> F: requestSummary(userId, chatId, key)
    F ->> CS: getMessages(userId, chatId)
    CS -->> F: owned, ordered history
    F ->> F: select last message as immutable boundary
    F ->> NS: requestChatSummary(..., throughMessageId, key)

    rect rgb(235, 245, 255)
        Note over NS, OS: One transaction
        NS ->> SR: reserve(userId, key, chatId, boundary, candidateNoteId)
        alt Reservation won
            SR -->> NS: reservation
            NS ->> NR: save GENERATING note
            NS ->> CR: save chat_note link
            NS ->> OS: publish NOTE_SUMMARY_REQUESTED
        else Key already exists for this user
            SR -->> NS: no reservation
            NS ->> SR: find(userId, key)
            alt Same chat
                NS ->> NR: load original note
            else Different chat
                NS -->> F: IDEMPOTENCY_KEY_REUSED
            end
        end
    end
    NS -->> HC: original or newly created note
    HC -->> C: 202 Accepted + Idempotency-Key
```

The reservation, placeholder note, `chat_note` link, and outbox event commit atomically. If any
write fails, the reservation also rolls back and the same key can be retried. Concurrent requests
with the same `(userId, Idempotency-Key)` converge on the winning transaction's `noteId`.

## Summary generation and indexing workers

The outbox separates durable database changes from slow provider work. Claim, provider work, and
completion/failure bookkeeping do not share one transaction.

```mermaid
sequenceDiagram
    autonumber
    participant P as OutboxPoller
    participant OS as OutboxService
    participant EP as OutboxEventProcessor
    participant SH as NoteSummaryRequestedHandler
    participant CS as ChatService
    participant R as RagService
    participant EM as EmbeddingModel
    participant DB as PostgreSQL / pgvector
    participant AI as ChatClient
    participant NS as NoteService
    participant IH as NoteIndexRequestedHandler
    P ->> OS: claim(availableSlots)
    rect rgb(235, 245, 255)
        Note over OS: Short claim transaction<br/>FOR UPDATE SKIP LOCKED
        OS ->> DB: PENDING or expired PROCESSING -> PROCESSING
    end
    P ->> EP: process(NOTE_SUMMARY_REQUESTED)
    EP ->> SH: handle(event)
    Note over SH, AI: External work, no surrounding database transaction
    SH ->> CS: getSummaryContext(userId, chatId, boundary)
    CS ->> DB: load chat and messages through boundary
    SH ->> R: search(userId, retrievalQuery)
    R ->> EM: embed(query)
    EM -->> R: query vector
    R ->> DB: ownership-filtered cosine search
    SH ->> AI: generate summary(current chat, related notes)
    AI -->> SH: summary text
    SH ->> NS: completeChatSummary(userId, noteId, content)

    rect rgb(235, 245, 255)
        Note over NS, DB: Summary completion transaction
        NS ->> DB: note GENERATING -> READY
        NS ->> DB: publish NOTE_INDEX_REQUESTED
    end
    EP ->> OS: complete(summary event)
    P ->> EP: process(NOTE_INDEX_REQUESTED)
    EP ->> IH: handle(event)
    IH ->> DB: load owned READY note
    IH ->> R: index(userId, noteId, content)
    R ->> R: split content into chunks
    R ->> EM: embed(chunks)
    EM -->> R: chunk vectors
    R ->> DB: replace this note's rag_chunks
    EP ->> OS: complete(index event)
```

On a handler error, `OutboxEventProcessor` calls `OutboxService.recordFailure` in a new short
transaction. The event returns to `PENDING` with exponential backoff until the configured attempt
limit. When a `NOTE_SUMMARY_REQUESTED` event reaches the limit, that same transaction marks the
outbox event and its still-`GENERATING` note as `FAILED`. A crashed worker leaves a `PROCESSING`
event reclaimable after its visibility deadline.

### Note states

```mermaid
stateDiagram-v2
    [*] --> GENERATING: HTTP request commits placeholder and summary event
    GENERATING --> READY: summary persisted and index event published
    GENERATING --> FAILED: summary event exhausts retries
    READY --> READY: indexing may be pending, retried, or complete
    READY --> [*]
    FAILED --> [*]
```

`READY` means the note content is available. It does not mean indexing has already completed.

## Note status stream

```mermaid
sequenceDiagram
    autonumber
    participant C as Web client
    participant NC as NoteController
    participant NS as NoteService
    participant NR as NoteRepository
    C ->> NC: GET notes/{noteId}/status/stream
    NC ->> NS: streamNoteStatus(userId, noteId)
    NS ->> NR: load owned note immediately
    NS -->> NC: current persisted status
    NC -->> C: event: status
    loop Every second until terminal status
        NS ->> NR: load owned note on boundedElastic
        alt Status changed
            NS -->> NC: new persisted status
            NC -->> C: event: status
        end
    end
    Note over NS, C: Stream closes after READY or FAILED
```

Missing and foreign note or chat identifiers both appear as `404`, so ownership information is not
leaked.

## Transaction boundary summary

| Use case             | Transactional work                                                | Work outside that transaction                                |
|----------------------|-------------------------------------------------------------------|--------------------------------------------------------------|
| New chat turn        | Lock chat, reserve turn, persist user message                     | Provider stream                                              |
| Finish chat turn     | Fence the attempt, persist terminal turn and assistant message    | SSE delivery                                                 |
| Cancel chat turn     | Lock chat, mark turn canceled, persist canceled assistant message | Provider request may finish later and is rejected by fencing |
| Request summary      | Reserve key, create note/link, publish summary event              | Summary generation                                           |
| Process outbox event | Claim, complete, or record failure each use a short transaction   | Handler, chat model, embedding model                         |
| Complete summary     | Persist content as `READY`, publish index event                   | Later indexing handler                                       |
