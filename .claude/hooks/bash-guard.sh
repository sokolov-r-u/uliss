#!/bin/bash
# PreToolUse(Bash): blocks commands that CLAUDE.md forbids without exceptions and asks before launching apps.
# Exit 2 blocks the call; stderr is shown to Claude as the reason. Patterns are Perl regexes.
set -u

input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -z "$cmd" ] && exit 0

block() {
  echo "Blocked by .claude/hooks/bash-guard.sh: $1" >&2
  exit 2
}

ask() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
  exit 0
}

# Code view: shell text without heredoc bodies and quoted strings, so prose never matches; commands hidden in
# sh -c / eval strings, $(...), backticks and heredocs fed to a shell are appended on their own lines.
code=$(printf '%s' "$cmd" | perl -0777 -e '
  $_ = <STDIN>; my @inner;
  s{(^|\n)([^\n]*?)<<-?[ \t]*(["\x27]?)(\w+)\3([^\n]*)\n((?:.*?\n)?)[ \t]*\4[ \t]*(?=\n|$)}{
    my ($nl, $pre, $rest, $body) = ($1, $2, $5, $6);
    push @inner, $body if $pre =~ /(?:^|[\s;&|(])(?:ba|z|da)?sh(?:\s|$)/;
    "$nl$pre $rest"
  }gse;
  while (/(?:^|[\s;&|(])(?:(?:ba|z|da)?sh\s+(?:-\w+\s+)*-c|eval)\s+(\x27[^\x27]*\x27|"(?:[^"\\]|\\.)*")/g) {
    push @inner, substr($1, 1, -1);
  }
  push @inner, $1 while /\$\(([^()]*)\)/g;
  push @inner, $1 while /\x60([^\x60]*)\x60/g;
  my $strip = sub { my $t = shift; $t =~ s/\x27[^\x27]*\x27|"(?:[^"\\]|\\.)*"/ /g; $t };
  print join("\n", map { $strip->($_) } $_, @inner);
')

# Text view: the raw command without heredoc bodies and commit messages, for path checks.
text=$(printf '%s' "$cmd" | perl -0777 -e '
  $_ = <STDIN>;
  s{<<-?[ \t]*(["\x27]?)(\w+)\1([^\n]*)\n(?:.*?\n)?[ \t]*\2[ \t]*(?=\n|$)}{ $3}gs;
  s{(?:^|\s)(?:-m|--message)(?:=|\s+)(?:\x27[^\x27]*\x27|"(?:[^"\\]|\\.)*"|\S+)}{ }g;
  print;
')

has() { PAT="$1" perl -0777 -ne 'exit(/$ENV{PAT}/m ? 0 : 1)' <<<"$code"; }
has_text() { PAT="$1" perl -0777 -ne 'exit(/$ENV{PAT}/m ? 0 : 1)' <<<"$text"; }

# Start of a command, after separators, keywords, env assignments and wrappers.
start='(?:^|[;&|(`{]|\b(?:then|do|else|elif)\b)\s*(?:(?:[A-Za-z_]\w*=\S*|env|command|time|nohup|sudo|builtin|xargs(?:\s+-\S+)*)\s+)*'
git="${start}(?:\S*/)?git(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path)(?:=\S+|\s+\S+)|--[a-z-]+(?:=\S+)?|-[A-Za-z]))*\s+"
seg='[^;&|\n]*'

if has "${git}(?:push|reset|rebase|revert|tag|merge|cherry-pick|clean|filter-branch|filter-repo|update-ref)\b"; then
  block "push, history rewrites, tags, merges and clean need the user's explicit per-request permission; ask the user to run it."
fi
if has "${git}(?:checkout|switch|worktree)\b"; then
  block "do not switch branches or use worktrees without the user asking (CLAUDE.md, Commits)."
fi
if has "${git}branch\s+(?:${seg}\s)?(?:-d|-D|--delete|-m|-M|--move|-f|--force)(?=\s|$)"; then
  block "deleting, renaming or forcing branches needs the user's explicit permission."
fi
if has "${git}stash\s+(?:drop|clear)\b" || has "${git}restore\b(?!${seg}--staged)" || has "${git}restore\b${seg}(?:--worktree|\s-W\b)"; then
  block "discarding uncommitted work needs the user's explicit permission."
fi
if has "${git}add\s+(?:${seg}\s)?(?:-A|--all|-u|--update|\./?|:/|\*)(?=\s|$|[;&|)])"; then
  block "stage explicit paths, never git add -A / . / -u / * (CLAUDE.md, Commits)."
fi

if has "${git}commit\b"; then
  flags=$(PAT="${git}commit\b(${seg})" perl -0777 -ne 'print $1 if /$ENV{PAT}/m' <<<"$code")
  if grep -Eq -- "--amend" <<<"$flags"; then
    block "amending needs the user's explicit permission; make a new commit."
  fi
  if PAT='(?:^|\s)(?:--all|-(?!-)[A-Za-z]*a[A-Za-z]*)(?=\s|$)' perl -ne 'exit(/$ENV{PAT}/ ? 0 : 1)' <<<"$flags"; then
    block "commit -a stages every modified file; stage explicit paths with git add <path>."
  fi
  if [ "$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)" = "main" ]; then
    block "never commit to main; ask the user which branch to create or switch to."
  fi
  message=$(printf '%s' "$cmd" | CWD="${cwd:-.}" perl -0777 -e '
    $_ = <STDIN>;
    sub body_of {
      my $v = shift;
      return $v =~ /^\$\(\s*cat\s*<<-?\s*["\x27]?(\w+)["\x27]?[^\n]*\n(.*?)\n?[ \t]*\1[ \t]*\n?\s*\)\s*$/s ? $2 : $v;
    }
    if (/(?:^|\s)(?:-F|--file)(?:=|\s*)-(?=\s|$)/) {
      print $2 if /<<-?[ \t]*["\x27]?(\w+)["\x27]?[^\n]*\n(.*?)\n[ \t]*\1[ \t]*(?:\n|$)/s;
    } elsif (/(?:^|\s)(?:-F|--file)(?:=|\s+)(?:\x27([^\x27]*)\x27|"((?:[^"\\]|\\.)*)"|(\S+))/) {
      my $f = $1 // $2 // $3;
      $f = "$ENV{CWD}/$f" unless $f =~ m{^/};
      if (open my $h, "<", $f) { local $/; print <$h>; }
    } else {
      my @m;
      while (/(?:^|\s)(?:-m|--message)(?:=|\s+)(?:\x27([^\x27]*)\x27|"((?:[^"\\]|\\.)*)"|(\S+))/gs) {
        push @m, body_of($1 // $2 // $3);
      }
      print join("\n\n", @m);
    }
  ')
  if [ -z "$message" ]; then
    block "pass a non-empty commit message with -m or -F; an editor cannot be used here."
  fi
  subject=$(grep -m1 -v '^[[:space:]]*$' <<<"$message")
  if ! grep -Eq "^(DE|FE|TD)  - [^[:space:]]" <<<"$subject"; then
    block "the subject must start with '<DE|FE|TD>  - <summary>' (two spaces before the dash)."
  fi
  if ! grep -q "Co-Authored-By: Claude" <<<"$message"; then
    block "the message must end with a 'Co-Authored-By: Claude <model> <noreply@anthropic.com>' trailer."
  fi
fi

if has "${start}(?:\S*/)?(?:kill|pkill|killall)(?=\s|$|[;&|)])"; then
  block "stopping processes needs the user's explicit permission; ask the user to do it."
fi
if has "${start}(?:\S*/)?psql(?=\s|$)" || has "\bexec\b${seg}\spsql(?=\s|$)"; then
  block "database scripts and psql need the user's explicit permission."
fi

if has_text "tdd-state"; then
  block "the TDD hook state belongs to the hooks; only the user switches the rule off."
fi
# Env files hold secrets: named directly, through a glob, or printed by compose config.
if PAT='(?<![\w.\/-])(?:[\w.\/-]*\/)?(\.env(?:\.[\w-]+)*)(?![\w])' perl -ne 'while (/$ENV{PAT}/g) { $f = 1 if $1 ne ".env.example" } END { exit !$f }' <<<"$text" \
  || has_text '(?<![\w.\/-])(?:[\w.\/-]*\/)?\.(?:e[\w.-]*)?[*?\[]' \
  || has "${start}docker(?:\s+compose|-compose)\b${seg}\sconfig\b"; then
  block "env files are off limits; use .env.example or ask the user for the value you need."
fi

if has "(?:^|[\s:])boot(?:Test)?Run(?=\s|$)" \
  || has "${start}(?:\S*/)?java(?:\s+-\S+)*\s+-jar(?=\s|$)" \
  || has "${start}docker(?:\s+compose|-compose)\b${seg}\s(?:up|start|restart|stop|down|kill|rm|run|create|pause)(?=\s|$)" \
  || has "${start}docker\s+(?:container\s+)?(?:run|start|restart|stop|kill|rm|pause)(?=\s|$)" \
  || has "${start}npm\s+(?:run\s+)?(?:dev|preview|start)(?=\s|$)"; then
  ask "Starting or stopping an application needs the user's permission (CLAUDE.md, Hard operational limits)."
fi

exit 0
