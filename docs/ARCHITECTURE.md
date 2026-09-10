# Architecture reference

Deeper rationale behind build/config mechanisms that only matters when touching those mechanisms
themselves — not needed for day-to-day feature work. Cross-cutting agent rules are in
`../AGENTS.md`; read those first.

## JaCoCo merging (`jacocoRootReport`)

`jacocoRootReport` (root `build.gradle.kts`) merges per-module `build/jacoco/{test,integrationTest}.exec` +
`build/classes/kotlin/main` from all subprojects except `uliss-design-system` into a single
`build/reports/jacoco/jacocoRootReport/{html/index.html,jacocoRootReport.xml}`. Both jacoco tasks
(the per-module `jacocoTestReport` and `jacocoRootReport`) merge exec data from both `test` and
`integrationTest` (JaCoCo attaches to both automatically — both tasks are of type `Test`; JaCoCo
matches exec↔classes by the CRC64 hash of the bytecode, not by project, so shared libraries without
their own tests, e.g. `:database`, correctly get coverage from the exec of whichever modules actually
use them). `integrationTest` is not forced via `dependsOn` — it requires Docker/Testcontainers,
so `./gradlew build`/`check` stay Docker-independent; its exec is only picked up if it's already on
disk from a previous run. Modules without a `test.exec`/`integrationTest.exec` are skipped lazily
(`fileTree` over existing files), which doesn't fail the task. Excluded from classDirectories are
`io/uliss/api/**` (generated protobuf/gRPC) and `**/*ApplicationKt.class`
(the Kotlin file-class with a top-level `fun main()` — unreachable by any test: `@SpringBootTest`
boots the context via `SpringApplicationBuilder` directly, without calling `main()`, and actually
running the application requires explicit permission under the root `AGENTS.md`).

## Convention plugins

Shared configuration is factored out into the included build `module/lib/gradle-plugins` (not
duplicated across modules):

- `io.uliss.kotlin-conventions` — base Kotlin/Spring module (library): toolchain,
  `group = io.uliss`, Spring BOM via dependency-management, compiler flags
  (`-Xjsr305=strict`, strict null-safety, `-Xmulti-dollar-interpolation`), JUnit Platform,
  the `integrationTest` task, JaCoCo coverage report (`test` only).
- `io.uliss.spring-boot-app` — inherits `kotlin-conventions` + applies the plugin
  `org.springframework.boot`. For executable applications (`auth`, `user-service`, `note-service`).
- `io.uliss.jpa-conventions` — applies `org.jetbrains.kotlin.plugin.jpa` (no-arg for
  JPA entities). Apply in modules with JPA entities (`auth`, `database`).

Versions of build plugins (kotlin-gradle-plugin, spring-boot-gradle-plugin, etc.) are declared
as `[libraries]` in `gradle/libs.versions.toml` and wired in
`gradle-plugins/build.gradle.kts` via `implementation(libs.*)`.

Inside a precompiled script plugin, the type-safe `libs` accessor isn't available (gradle/gradle#15383),
so in `io.uliss.kotlin-conventions.gradle.kts` the catalog is read via the runtime API
`VersionCatalogsExtension` (`findVersion`/`findLibrary`). Versions of BOM-managed starters
(`spring-boot-starter-*`) are not put in the catalog — their version is already unified via the BOM
version.

## Library auto-configuration & config

Libraries self-configure and are picked up by applications without explicit bean imports:

- Each lib registers its own `*AutoConfiguration` via
  `src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
  (`security`, `database`, `exception`, `logging`).
- A lib places `<module>.yml` (`database.yml`, `exception.yml`, `security.yml`) in its
  resources, and the application imports it in its own `application.yaml` via
  `spring.config.import: classpath:<module>.yml`
  (example — `module/auth/src/main/resources/application.yaml`).

## Note summary and RAG pipeline

Chat summarization is asynchronous. The request transaction stores a `GENERATING` note, its chat
link, and `NOTE_SUMMARY_REQUESTED` in the note-service-owned outbox, then returns `202 Accepted`.
The outbox processor claims work in short transactions with `FOR UPDATE SKIP LOCKED`; embedding,
retrieval, and LLM calls run without a surrounding database transaction. Completion stores the
summary and `NOTE_INDEX_REQUESTED` atomically. Terminal retry exhaustion stores both the failed
outbox state and `NoteStatus.FAILED` atomically.

The current chat remains the authoritative summary input. OpenAI embeddings retrieve related prior
notes as untrusted secondary context for terminology and continuity; DeepSeek produces the final
summary. The captured `throughMessageId` makes the input stable even if the user continues the chat
after requesting a summary.

RAG persistence is domain-owned rather than Spring AI `VectorStore` storage. `note.rag_chunks`
stores `user_id` and `note_id` as relational columns, and every similarity query requires the
authenticated user ID. Spring AI remains responsible for token splitting, batching, embedding, and
chat-model calls. Exact cosine search follows the mandatory user filter; no global ANN index is
used until production measurements justify a tenant-aware indexing strategy.

Persisted note state is the source of truth. The status SSE endpoint immediately reads PostgreSQL,
polls only the ownership-filtered note, emits changes, and closes on `READY` or `FAILED`. This makes
reconnects and multiple service instances correct without in-memory coordination; the linear
per-connection polling cost and future alternatives are documented in `TECH_DEBT.md`.
