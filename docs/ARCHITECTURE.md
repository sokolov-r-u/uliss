# Architecture reference

Deeper rationale behind build/config mechanisms that only matters when touching those mechanisms
themselves — not needed for day-to-day feature work. Cross-cutting rules — `../CLAUDE.md`, read
that first.

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
running the application is prohibited — see "Operational constraints" in the root `CLAUDE.md`).

## Convention plugins

Shared configuration is factored out into the included build `module/lib/gradle-plugins` (not
duplicated across modules):

- `io.uliss.kotlin-conventions` — base Kotlin/Spring module (library): toolchain,
  `group = io.uliss`, Spring BOM via dependency-management, compiler flags
  (`-Xjsr305=strict`, strict null-safety, `-Xmulti-dollar-interpolation`), JUnit Platform,
  the `integrationTest` task, JaCoCo coverage report (`test` only).
- `io.uliss.spring-boot-app` — inherits `kotlin-conventions` + applies the plugin
  `org.springframework.boot`. For executable applications (`auth`, `user-service`).
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
