#!/bin/bash
# PreToolUse(Bash): blocks commands that CLAUDE.md forbids without exceptions and asks before launching apps.
# The decision is made by bash-guard.pl. Exit 2 blocks the call; stderr is shown to Claude as the reason.
set -u

input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -z "$cmd" ] && exit 0

if ! decision=$(printf '%s' "$cmd" | perl "$(dirname "$0")/bash-guard.pl" "${cwd:-.}"); then
  echo "Blocked by .claude/hooks/bash-guard.sh: the guard itself failed; fix .claude/hooks/bash-guard.pl." >&2
  exit 2
fi
kind="${decision%%$'\t'*}"
reason="${decision#*$'\t'}"

case "$kind" in
  block)
    echo "Blocked by .claude/hooks/bash-guard.sh: $reason" >&2
    exit 2
    ;;
  ask)
    jq -n --arg r "$reason" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
    ;;
esac
exit 0
