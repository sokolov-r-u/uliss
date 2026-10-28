#!/bin/bash
# PreToolUse(Read|Edit|Write|MultiEdit|NotebookEdit|Grep): keeps file tools away from env files.
# Exit 2 blocks the call; stderr is shown to Claude as the reason.
set -u

input=$(cat)
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // "."' <<<"$input")

case "$path" in
  */.claude/tdd-state/* | .claude/tdd-state/*)
    echo "Blocked by .claude/hooks/file-guard.sh: the TDD hook state belongs to the hooks; only the user switches the rule off." >&2
    exit 2
    ;;
esac

env_block() {
  echo "Blocked by .claude/hooks/file-guard.sh: env files are off limits; use .env.example or ask the user." >&2
  exit 2
}

name=$(basename "$path")
if [[ "$name" =~ ^\.env(\.[[:alnum:]_-]+)*$ ]] && [ "$name" != ".env.example" ]; then
  env_block
fi

# A Grep glob that starts with a dot and matches an env file name.
glob=$(jq -r '.tool_input.glob // empty' <<<"$input")
glob="${glob##*/}"
if [[ "$glob" == .* ]]; then
  for candidate in .env .env.local .env.production; do
    # shellcheck disable=SC2053 # the glob is a pattern on purpose
    [[ "$candidate" == $glob ]] && env_block
  done
fi

exit 0
