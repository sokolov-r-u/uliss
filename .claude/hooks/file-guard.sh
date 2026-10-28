#!/bin/bash
# PreToolUse(Read|Edit|Write|MultiEdit|NotebookEdit|Grep): keeps file tools away from env files.
# Exit 2 blocks the call; stderr is shown to Claude as the reason.
set -u

input=$(cat)
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty' <<<"$input")
[ -z "$path" ] && exit 0

name=$(basename "$path")
if [[ "$name" =~ ^\.env(\.[[:alnum:]_-]+)*$ ]] && [ "$name" != ".env.example" ]; then
  echo "Blocked by .claude/hooks/file-guard.sh: env files are off limits; use .env.example or ask the user." >&2
  exit 2
fi

exit 0
