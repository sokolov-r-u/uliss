#!/bin/bash
# PostToolUse / PostToolUseFailure: records, per session and Gradle module, test edits and red test runs.
# Never blocks; tdd-gate.sh reads the state.
set -u
. "$(dirname "$0")/tdd-lib.sh"

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
tool=$(jq -r '.tool_name // empty' <<<"$input")
[ -z "$session" ] && exit 0

file=$(state_file "$session")

# Adds a module to a key; a red counts only after a test edit of that module. A lock directory serializes
# concurrent hook runs of one session.
add() { # key module
  local lock="$file.lock" tries=0 stale=false tmp="$file.$$"
  mkdir -p "$STATE_DIR"
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -gt "${TDD_LOCK_TRIES:-50}" ]; then
      # A lock older than the wait belongs to a crashed run; remove it once, then give up.
      $stale && return 0
      rmdir "$lock" 2>/dev/null
      stale=true
      tries=0
      continue
    fi
    sleep 0.1
  done
  [ -f "$file" ] || echo '{"tests": [], "red": []}' >"$file"
  jq --arg k "$1" --arg m "$2" '
    if $k == "red" and ((.tests | index($m)) | not) then . else .[$k] = ((.[$k] + [$m]) | unique) end
  ' "$file" >"$tmp" && mv "$tmp" "$file"
  rmdir "$lock"
}

case "$tool" in
  Edit | Write | MultiEdit)
    path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    case "$path" in
      */src/test/* | */src/integrationTest/*)
        module=$(module_of "$path")
        [ -n "$module" ] && add tests "$module"
        ;;
    esac
    ;;
  Bash)
    command=$(jq -r '.tool_input.command // empty' <<<"$input")
    grep -q "gradlew" <<<"$command" || exit 0
    output=$(jq -r '[.error // empty, (.tool_response // {} | .. | strings)] | join("\n")' <<<"$input")
    tasks='(test|integrationTest|compileTestKotlin|compileIntegrationTestKotlin|compileTestJava|compileIntegrationTestJava)'
    grep -Eo -- "(Execution failed for task ':[^:']+:${tasks}'|> Task :[^:[:space:]]+:${tasks} FAILED)" <<<"$output" \
      | sed -E "s/.*:([^:']+):[A-Za-z]+('| FAILED)$/\1/" \
      | sort -u \
      | while read -r module; do add red "$module"; done
    ;;
esac

exit 0
