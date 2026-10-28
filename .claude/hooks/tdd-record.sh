#!/bin/bash
# PostToolUse / PostToolUseFailure: records, per session and Gradle module, test edits and red test runs.
# Never blocks; tdd-gate.sh reads the state.
set -u
. "$(dirname "$0")/tdd-lib.sh"

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
tool=$(jq -r '.tool_name // empty' <<<"$input")
[ -z "$session" ] && exit 0

add() { # key module
  local file tmp
  file=$(state_file "$session")
  mkdir -p "$STATE_DIR"
  [ -f "$file" ] || echo '{"tests": [], "red": []}' >"$file"
  tmp="$file.$$"
  jq --arg k "$1" --arg m "$2" '.[$k] = ((.[$k] + [$m]) | unique)' "$file" >"$tmp" && mv "$tmp" "$file"
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
