#!/bin/bash
# PreToolUse(Bash): blocks commands that CLAUDE.md forbids without exceptions.
# Exit 2 blocks the call; stderr is shown to Claude as the reason.
set -u

input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -z "$cmd" ] && exit 0

block() {
  echo "Blocked by .claude/hooks/bash-guard.sh: $1" >&2
  exit 2
}

# Command text without heredoc bodies and quoted strings, so prose in messages never matches.
code=$(printf '%s' "$cmd" | perl -0777 -pe '
  s/<<-?\s*["\x27]?(\w+)["\x27]?.*?\n\s*\1[ \t]*(\n|$)/ /gs;
  s/\x27[^\x27]*\x27/ /gs;
  s/"(?:[^"\\]|\\.)*"/ /gs;
')

# Start of a command: line start or after ; & | ( and optional env assignments.
start='(^|[;&|(])[[:space:]]*'
git="${start}git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+|[[:space:]]+--?[a-z-]+(=[^[:space:]]+)?)*[[:space:]]+"

has() { grep -Eq -- "$1" <<<"$code"; }

if has "${git}(push|reset|rebase|revert|tag|merge|cherry-pick|clean|filter-branch|filter-repo|update-ref)([[:space:]]|$)"; then
  block "push, history rewrites, tags, merges and clean need the user's explicit per-request permission; ask the user to run it."
fi
if has "${git}(checkout|switch|worktree)([[:space:]]|$)"; then
  block "do not switch branches or use worktrees without the user asking (CLAUDE.md, Commits)."
fi
if has "${git}branch[[:space:]]+([^;&|]*[[:space:]])?(-d|-D|--delete|-m|-M|--move|-f|--force)([[:space:]]|$)"; then
  block "deleting, renaming or forcing branches needs the user's explicit permission."
fi
if has "${git}add[[:space:]]+([^;&|]*[[:space:]])?(-A|--all|-u|--update|\.|:/)([[:space:]]|$|[;&|)])"; then
  block "stage explicit paths, never git add -A / . / -u (CLAUDE.md, Commits)."
fi

if has "${git}commit([[:space:]]|$)"; then
  if has "--amend"; then
    block "amending needs the user's explicit permission; make a new commit."
  fi
  branch=$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)
  if [ "$branch" = "main" ]; then
    block "never commit to main; ask the user which branch to create or switch to."
  fi
  message="$cmd"
  file=$(grep -Eo -- "(-F|--file)[[:space:]=]+[^[:space:];&|]+" <<<"$code" | head -1 | sed -E 's/^(-F|--file)[[:space:]=]+//')
  if [ -n "$file" ]; then
    case "$file" in /*) ;; *) file="${cwd:-.}/$file" ;; esac
    message=$(cat "$file" 2>/dev/null)
  elif ! has "(^|[[:space:]])(-m|--message)([[:space:]=]|$)|(^|[[:space:]])-[a-zA-Z]*m([[:space:]]|$)"; then
    block "pass the commit message with -m or -F; an editor cannot be used here."
  fi
  if ! grep -Eq "(^|[\"'[:space:]])(DE|FE|TD)  - [^[:space:]]" <<<"$message"; then
    block "the message must start with '<DE|FE|TD>  - <summary>' (two spaces before the dash)."
  fi
  if ! grep -q "Co-Authored-By: Claude" <<<"$message"; then
    block "the message must end with a 'Co-Authored-By: Claude <model> <noreply@anthropic.com>' trailer."
  fi
fi

if has "(${start}|xargs([[:space:]]+-[^[:space:]]+)*[[:space:]]+)(sudo[[:space:]]+)?(kill|pkill|killall)([[:space:]]|$)"; then
  block "stopping processes needs the user's explicit permission; ask the user to do it."
fi
if has "(^|[^[:alnum:]_-])psql([[:space:]]|$)"; then
  block "database scripts and psql need the user's explicit permission."
fi

exit 0
