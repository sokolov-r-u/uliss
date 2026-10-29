#!/bin/bash
# PreToolUse(Edit|Write|MultiEdit): production Kotlin/Java of a Gradle module may change only after
# this session edited a test of that module and ran its tests red (.claude/skills/tdd/SKILL.md).
set -u
. "$(dirname "$0")/tdd-lib.sh"

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
rel="${path#"$PROJECT_DIR"/}"

[[ "$rel" =~ ^module/.+/src/main/(kotlin|java)/.+\.(kt|java)$ ]] || exit 0
case "$rel" in module/web/* | module/lib/uliss-design-system/*) exit 0 ;; esac
[ -f "$STATE_DIR/off" ] && exit 0

module=$(module_of "$path")
[ -z "$module" ] && exit 0

file=$(state_file "$session")
has() { [ -f "$file" ] && jq -e --arg k "$1" --arg m "$module" '.[$k] | index($m)' "$file" >/dev/null; }

missing=""
has tests || missing="edit a test of :$module"
has red || missing="${missing:+$missing, then }run ./gradlew :$module:test (or integrationTest) and see it fail"
[ -z "$missing" ] && exit 0

cat >&2 <<EOF
Blocked by .claude/hooks/tdd-gate.sh: test first for :$module — $missing (.claude/skills/tdd/SKILL.md).
If this change has no behavior to test (a pure refactor in a new session, generated code), ask the user;
only the user can switch the rule off with: touch .claude/tdd-state/off
EOF
exit 2
