#!/bin/bash
# Runs the project hooks against synthetic tool calls and checks their decisions.
# Usage: .claude/hooks/test/run.sh
set -u

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

# Two throwaway repositories: one on main, one on a task branch.
make_repo() {
  git init -q -b main "$1"
  git -C "$1" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  if [ -n "${2:-}" ]; then git -C "$1" switch -q -c "$2"; fi
}
MAIN="$TMP/main"
WORK="$TMP/work"
make_repo "$MAIN"
make_repo "$WORK" TD-test
REBASE="$TMP/rebase"
make_repo "$REBASE" TD-rebase
git -C "$REBASE" config pull.rebase true

# Prints block, ask, allow or error<N> for a hook run on the given JSON input.
decision() {
  local out code
  out=$(printf '%s' "$2" | CLAUDE_PROJECT_DIR="${PROJECT:-$WORK}" "$HOOKS/$1" 2>/dev/null)
  code=$?
  if [ "$code" -eq 2 ]; then
    echo block
  elif [ "$code" -ne 0 ]; then
    echo "error$code"
  elif jq -e '.hookSpecificOutput.permissionDecision == "ask"' <<<"$out" >/dev/null 2>&1; then
    echo ask
  else
    echo allow
  fi
}

bash_call() {
  jq -n --arg c "$1" --arg d "${2:-$WORK}" \
    '{hook_event_name: "PreToolUse", session_id: "s1", cwd: $d, tool_name: "Bash", tool_input: {command: $c}}'
}

expect() {
  local expected="$1" hook="$2" input="$3" label="$4" got
  got=$(decision "$hook" "$input")
  if [ "$got" = "$expected" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL [$hook] $label: expected $expected, got $got"
  fi
}

for f in "$HOOKS"/test/cases/*.sh; do
  # shellcheck source=/dev/null
  . "$f"
done

echo "hooks: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
