# Rules of content-guard.sh for the text an edit adds. Sourced by run.sh.

edit_call() {
  jq -n --arg p "$1" --arg o "$2" --arg n "$3" \
    '{hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Edit",
      tool_input: {file_path: $p, old_string: $o, new_string: $n}}'
}
write_call() {
  jq -n --arg p "$1" --arg c "$2" \
    '{hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Write", tool_input: {file_path: $p, content: $c}}'
}

KT_TEST=/repo/module/note/note-app/src/test/kotlin/io/uliss/note/NoteServiceTest.kt
KT_MAIN=/repo/module/note/note-app/src/main/kotlin/io/uliss/note/NoteService.kt
VITEST=/repo/module/web/src/notes/NotePanel.test.tsx
VISUAL=/repo/module/web/visual/tests/notes.spec.ts
GRADLE=/repo/module/note/note-app/build.gradle.kts

# Skipped, focused and sleeping tests
expect block content-guard.sh "$(edit_call "$KT_TEST" "@Test" "@Disabled
    @Test")" "@Disabled added"
expect block content-guard.sh "$(edit_call "$VITEST" "it('a', () => {" "it.only('a', () => {")" "it.only"
expect block content-guard.sh "$(edit_call "$VITEST" "test('a'" "test.skip('a'")" "test.skip"
expect block content-guard.sh "$(edit_call "$VITEST" "describe('a'" "describe.only('a'")" "describe.only"
expect block content-guard.sh "$(edit_call "$KT_TEST" "val x = 1" "Thread.sleep(100)")" "Thread.sleep"
expect allow content-guard.sh "$(edit_call "$VISUAL" "test('notes', async" "test.skip(true, 'epic summary-place: re-enable in the final task')
test('notes', async")" "Playwright skip with an epic marker"
expect block content-guard.sh "$(edit_call "$VISUAL" "test('notes'" "test.skip(true, 'later')
test('notes'")" "Playwright skip without an epic marker"
expect allow content-guard.sh "$(edit_call "$KT_TEST" "@Disabled
    @Test
    fun a() {}" "@Disabled
    @Test
    fun a() { assert(true) }")" "edit around an existing @Disabled"
expect allow content-guard.sh "$(edit_call "$KT_MAIN" "val x = 1" "Thread.sleep(100)")" "sleep in production code is not a test rule"

# TODO and FIXME in sources
expect block content-guard.sh "$(edit_call "$KT_MAIN" "val x = 1" "// TODO: handle errors
val x = 1")" "TODO in Kotlin"
expect block content-guard.sh "$(edit_call /repo/module/web/src/notes/api.ts "a" "a // FIXME")" "FIXME in TypeScript"
expect allow content-guard.sh "$(edit_call /repo/docs/TECH_DEBT.md "a" "- TODO: later")" "TODO in docs"
expect allow content-guard.sh "$(edit_call "$KT_MAIN" "val x = 1" "val todoList = 1")" "todo as part of a name"

# Versions belong in the version catalog
expect block content-guard.sh "$(edit_call "$GRADLE" "dependencies {" "dependencies {
    implementation(\"org.jsoup:jsoup:1.18.1\")")" "inline dependency version"
expect block content-guard.sh "$(edit_call "$GRADLE" "plugins {" "plugins {
    id(\"com.example.x\") version \"1.0\"")" "inline plugin version"
expect allow content-guard.sh "$(edit_call "$GRADLE" "dependencies {" "dependencies {
    implementation(libs.jsoup)
    implementation(\"org.springframework.boot:spring-boot-starter-web\")")" "catalog and BOM-managed coordinates"
expect allow content-guard.sh "$(edit_call /repo/gradle/libs.versions.toml "[versions]" "[versions]
jsoup = \"1.18.1\"")" "version catalog"

# Write compares with the file on disk
mkdir -p "$TMP/src/test/kotlin"
EXISTING="$TMP/src/test/kotlin/ExistingTest.kt"
printf '@Disabled\n@Test\nfun a() {}\n' >"$EXISTING"
expect allow content-guard.sh "$(write_call "$EXISTING" "@Disabled
@Test
fun a() { check(true) }")" "rewrite keeps an existing @Disabled"
expect block content-guard.sh "$(write_call "$EXISTING" "@Disabled
@Test
fun a() {}
@Disabled
@Test
fun b() {}")" "rewrite adds a second @Disabled"
expect block content-guard.sh "$(write_call "$TMP/src/test/kotlin/NewTest.kt" "@Disabled
class NewTest")" "new file with @Disabled"
