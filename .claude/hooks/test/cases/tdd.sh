# Test-first rule of tdd-record.sh and tdd-gate.sh. Sourced by run.sh.

PROJECT="$TMP/proj"
mkdir -p "$PROJECT/.claude/tdd-state"
cat >"$PROJECT/settings.gradle.kts" <<'EOF'
include("auth", "note", "user")
project(":auth").projectDir = file("module/auth")
project(":note").projectDir = file("module/note/note-app")
project(":user").projectDir = file("module/user/user-app")
EOF

NOTE_MAIN="$PROJECT/module/note/note-app/src/main/kotlin/io/uliss/note/NoteService.kt"
NOTE_TEST="$PROJECT/module/note/note-app/src/test/kotlin/io/uliss/note/NoteServiceTest.kt"
AUTH_MAIN="$PROJECT/module/auth/src/main/kotlin/io/uliss/auth/AuthService.kt"
AUTH_TEST="$PROJECT/module/auth/src/test/kotlin/io/uliss/auth/AuthServiceTest.kt"
USER_MAIN="$PROJECT/module/user/user-app/src/main/kotlin/io/uliss/user/UserService.kt"
USER_TEST="$PROJECT/module/user/user-app/src/integrationTest/kotlin/io/uliss/user/UserRepositoryIT.kt"

gate_call() {
  jq -n --arg s "$1" --arg p "$2" \
    '{hook_event_name: "PreToolUse", session_id: $s, tool_name: "Edit",
      tool_input: {file_path: $p, old_string: "a", new_string: "b"}}'
}
# Records a successful edit of a file.
edited() {
  jq -n --arg s "$1" --arg p "$2" \
    '{hook_event_name: "PostToolUse", session_id: $s, tool_name: "Edit", tool_input: {file_path: $p}, tool_response: {}}' \
    | CLAUDE_PROJECT_DIR="$PROJECT" "$HOOKS/tdd-record.sh"
}
# Records a Gradle run that exited non-zero with the given output.
failed_run() {
  jq -n --arg s "$1" --arg e "$2" \
    '{hook_event_name: "PostToolUseFailure", session_id: $s, tool_name: "Bash",
      tool_input: {command: "./gradlew :x:test"}, error: ("Exit code 1\n" + $e)}' \
    | CLAUDE_PROJECT_DIR="$PROJECT" "$HOOKS/tdd-record.sh"
}
# Records a Gradle run piped through tail, which exits zero.
piped_run() {
  jq -n --arg s "$1" --arg o "$2" \
    '{hook_event_name: "PostToolUse", session_id: $s, tool_name: "Bash",
      tool_input: {command: "./gradlew :x:test 2>&1 | tail -30"}, tool_response: {stdout: $o, stderr: ""}}' \
    | CLAUDE_PROJECT_DIR="$PROJECT" "$HOOKS/tdd-record.sh"
}

# Production code needs a test edit and a red run of the same module in the same session
expect block tdd-gate.sh "$(gate_call s-a "$NOTE_MAIN")" "production edit with nothing recorded"
edited s-a "$NOTE_TEST"
expect block tdd-gate.sh "$(gate_call s-a "$NOTE_MAIN")" "test edited but never run red"
failed_run s-a "* What went wrong:
Execution failed for task ':note:test'."
expect allow tdd-gate.sh "$(gate_call s-a "$NOTE_MAIN")" "test edited and run red"
expect block tdd-gate.sh "$(gate_call s-a "$AUTH_MAIN")" "red in another module does not count"
expect block tdd-gate.sh "$(gate_call s-b "$NOTE_MAIN")" "red in another session does not count"

# A test that does not compile yet is a red too, so stubs can be created
edited s-c "$AUTH_TEST"
failed_run s-c "> Task :auth:compileTestKotlin FAILED"
expect allow tdd-gate.sh "$(gate_call s-c "$AUTH_MAIN")" "test compilation failure"

# Integration tests and piped output count
edited s-d "$USER_TEST"
piped_run s-d "> Task :user:integrationTest FAILED
3 tests completed, 1 failed"
expect allow tdd-gate.sh "$(gate_call s-d "$USER_MAIN")" "integration test red seen through a pipe"

# Production compilation failures are not a red test
edited s-e "$NOTE_TEST"
failed_run s-e "Execution failed for task ':note:compileKotlin'."
expect block tdd-gate.sh "$(gate_call s-e "$NOTE_MAIN")" "main compilation failure"

# A red run before the test edit is an old failure, not the new test
failed_run s-f "Execution failed for task ':note:test'."
edited s-f "$NOTE_TEST"
expect block tdd-gate.sh "$(gate_call s-f "$NOTE_MAIN")" "red recorded before the test edit"

# Paths outside production Kotlin are not gated
expect allow tdd-gate.sh "$(gate_call s-x "$NOTE_TEST")" "test file"
expect allow tdd-gate.sh "$(gate_call s-x "$PROJECT/module/note/note-app/src/main/resources/application.yml")" "resources"
expect allow tdd-gate.sh "$(gate_call s-x "$PROJECT/module/note/note-app/src/main/resources/db/migration/V9__x.sql")" "migration"
expect allow tdd-gate.sh "$(gate_call s-x "$PROJECT/module/note/note-app/build.gradle.kts")" "build file"
expect allow tdd-gate.sh "$(gate_call s-x "$PROJECT/module/web/src/notes/NotePanel.tsx")" "web"
expect allow tdd-gate.sh "$(gate_call s-x "$PROJECT/docs/tasks/x.md")" "docs"

# Only the user switches the rule off
touch "$PROJECT/.claude/tdd-state/off"
expect allow tdd-gate.sh "$(gate_call s-x "$NOTE_MAIN")" "switched off by the user"
rm "$PROJECT/.claude/tdd-state/off"
expect block bash-guard.sh "$(bash_call "touch .claude/tdd-state/off")" "agent switches the rule off through the shell"
expect block file-guard.sh "$(jq -n --arg p "$PROJECT/.claude/tdd-state/off" \
  '{hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Write", tool_input: {file_path: $p, content: ""}}')" \
  "agent switches the rule off through Write"

unset PROJECT
