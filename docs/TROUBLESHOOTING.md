# Troubleshooting

Known problems and their fixes/workarounds, factored out of `CLAUDE.md` to keep it a policy
document rather than a debugging log. `CLAUDE.md` links here; add new entries here, not there.

## Gradle under sandboxed agent environments (e.g. Claude Code's Bash sandbox)

Two gotchas specific to running Gradle under a restrictive sandbox, not seen in a normal shell:

- **Flaky Kotlin compiler daemon failures** (`kotlin-compiler-in-<project>-*.alive: Operation not
  permitted`): the daemon writes to the OS-default `java.io.tmpdir`, which some sandboxes deny.
  Mitigated (not fully fixed — see caveat below) via `org.gradle.jvmargs=-Djava.io.tmpdir=/tmp`
  **and** `kotlin.daemon.jvmargs=-Djava.io.tmpdir=/tmp` in the root `gradle.properties` (`/tmp` is
  allow-listed almost everywhere `/var/folders/...`-style per-user tmp dirs are not) — the Kotlin
  compile daemon is a separate JVM from the Gradle daemon, so it needs its own jvmargs property,
  `org.gradle.jvmargs` alone isn't enough. This helps the per-module `compileKotlin`/
  `compileTestKotlin` daemon. It does **not** help `:gradle-plugins:compilePluginsBlocks` (the
  included build that hosts the convention plugins, see "Convention plugins" in `CLAUDE.md`) —
  that task's own Kotlin-compiler invocation hit the identical `.alive` failure even pointed
  straight at `/tmp` itself, meaning the sandbox denies whatever specific syscall creates that
  file (likely an exclusive-create/lock primitive) regardless of path, not the path itself.
  Adding the same properties to `module/lib/gradle-plugins/gradle.properties` was tried and
  reverted — it didn't fix that task and only invalidated its build cache. If
  `compilePluginsBlocks` starts failing under a sandbox, there is currently no known fix short of
  running outside the sandbox for that one step (e.g. its output is cached once it succeeds - via
  a normal terminal invocation - so it's a one-time cost, not a per-run one).
- **Mockito's default inline mock maker fails outright**: `Could not self-attach to current VM` /
  `VirtualMachineImpl.createAttachFile0: Operation not permitted` — the JVM's native attach
  mechanism (needed to instrument classes without an agent) is blocked at the syscall level; no
  JVM flag works around this. Fix per affected module: add
  `src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker` containing the line
  `mock-maker-subclass` — switches Mockito to classic subclass-based mocking, which needs no
  agent/attach at all. Currently added only to `note-app` (where this was first hit); add the same
  file to another module's test resources if its tests hit the identical failure in such an
  environment. Caveat: subclass mocking can't mock `final` classes/methods — not an issue so far
  since `kotlin-spring` already auto-opens `@Component`/`@Service`/etc. classes, and everything
  else mocked so far is an interface.

## macOS: `.alive` `FileSystemException` / FSEvents stream failure outside the sandbox too

**(2026-08-22)** The same `.alive`-file `FileSystemException` (plus a companion "Could not start
the FSEvents stream" warning) showed up in a plain, non-sandboxed terminal on macOS — not sandbox-
specific after all. Investigated: no MDM profile, no EDR/security system extension
(`systemextensionsctl list` only showed Karabiner/Proton VPN/OBS), no relevant `log show` entries.
Granting the terminal app Full Disk Access and restarting it did **not** fix it. A full macOS
reboot did — `./gradlew :note:test` passed immediately after, no code or config changes needed.

Root cause wasn't pinned down (likely some per-boot OS-level state tied to file-locking/FSEvents,
possibly related to `/var/folders/<hash>` — see the sandboxed-daemon entry above for what that
directory is). If `./gradlew` fails this way outside the sandbox too, try a reboot before digging
further into `gradle.properties`/Mockito changes.
