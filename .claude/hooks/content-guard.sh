#!/bin/bash
# PreToolUse(Edit|Write|MultiEdit): blocks edits that add text CLAUDE.md forbids.
# Only additions count: text already in the replaced part (or on disk for Write) is ignored.
set -u

input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$path" ] && exit 0

case "$tool" in
  Edit)
    new=$(jq -r '.tool_input.new_string // ""' <<<"$input")
    old=$(jq -r '.tool_input.old_string // ""' <<<"$input")
    ;;
  MultiEdit)
    new=$(jq -r '[.tool_input.edits[]?.new_string] | join("\n")' <<<"$input")
    old=$(jq -r '[.tool_input.edits[]?.old_string] | join("\n")' <<<"$input")
    ;;
  Write)
    new=$(jq -r '.tool_input.content // ""' <<<"$input")
    old=$(cat "$path" 2>/dev/null || true)
    ;;
  *) exit 0 ;;
esac

# Playwright skips that carry an epic marker are allowed (module/web/CLAUDE.md).
epic_skip="test\.skip\(true, *['\"]epic "
count() { grep -Ev -- "$epic_skip" <<<"$2" | grep -Eo -- "$1" | wc -l; }
adds() { [ "$(count "$1" "$new")" -gt "$(count "$1" "$old")" ]; }

block() {
  echo "Blocked by .claude/hooks/content-guard.sh: $1" >&2
  exit 2
}

case "$path" in
  */node_modules/* | */dist/* | */build/*) exit 0 ;;
esac

is_test=false
case "$path" in
  */src/test/* | */src/integrationTest/* | */src/testFixtures/* | */visual/* | */e2e/* | *.test.* | *.spec.*) is_test=true ;;
esac

if $is_test; then
  if adds "@(Disabled[[:alnum:]_]*|Ignore)([^[:alnum:]_]|$)"; then
    block "tests are never disabled (CLAUDE.md, Testing rules); fix the test or ask the user."
  fi
  if adds "(^|[^[:alnum:]_])(it|test|describe|suite|context)\.(skip|only|todo|fixme|skipIf|runIf)([^[:alnum:]_]|$)" \
    || adds "(^|[^[:alnum:]_])[xf](it|describe|test)\("; then
    block "no skip/only/fixme in tests; the only exception is a Playwright skip with an epic marker (module/web/CLAUDE.md)."
  fi
  if adds "Thread\.sleep\("; then
    block "tests are deterministic: use Awaitility or an injected Clock instead of Thread.sleep."
  fi
fi

case "$path" in
  *.kt | *.kts | *.java | *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.sql)
    if adds "(^|[^[:alnum:]_])(TODO|FIXME)([^[:alnum:]_]|$)"; then
      block "no TODO/FIXME in sources; record deferred work in docs/TECH_DEBT.md."
    fi
    ;;
esac

case "$path" in
  *.gradle.kts)
    if adds "\"[[:alnum:]_.-]+:[[:alnum:]_.-]+:[0-9][^\"]*\"" || adds "\)[[:space:]]+version[[:space:]]+\""; then
      block "versions live in gradle/libs.versions.toml; reference the catalog (libs.*) or rely on the BOM."
    fi
    ;;
esac

exit 0
