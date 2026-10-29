# Bypasses and false positives found in the first code review. Sourced by run.sh.

CO='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

# Prefixes and wrappers
expect block bash-guard.sh "$(bash_call "FOO=1 git push")" "env assignment prefix"
expect block bash-guard.sh "$(bash_call "env git push")" "env wrapper"
expect block bash-guard.sh "$(bash_call "command git push")" "command wrapper"
expect block bash-guard.sh "$(bash_call "time kill 12")" "time wrapper"
expect block bash-guard.sh "$(bash_call "/usr/bin/git push -f")" "absolute git path"
expect block bash-guard.sh "$(bash_call "{ git push; }")" "brace group"
expect block bash-guard.sh "$(bash_call "if true; then git push; fi")" "then branch"
expect block bash-guard.sh "$(bash_call "echo \`git push\`")" "backticks"
expect block bash-guard.sh "$(bash_call "git -P push")" "uppercase git option"
expect block bash-guard.sh "$(bash_call "git --git-dir .git push")" "git option with a separate value"
expect block bash-guard.sh "$(bash_call "bash -c 'git checkout main'")" "bash -c"
expect block bash-guard.sh "$(bash_call "sh -c \"kill 1\"")" "sh -c"

# Quote and heredoc stripping must not hide commands
expect block bash-guard.sh "$(bash_call "echo \"don't\" && git push && echo 'x'")" "apostrophe inside double quotes"
expect block bash-guard.sh "$(bash_call "cat <<EOF > /dev/null && git push
x
EOF")" "command after a heredoc opener"

# Staging through commit
expect block bash-guard.sh "$(bash_call "git commit -am 'TD  - x' -m '$CO'")" "commit -am"
expect block bash-guard.sh "$(bash_call "git commit --all -m 'TD  - x' -m '$CO'")" "commit --all"
expect block bash-guard.sh "$(bash_call "git add ./")" "add ./"
expect block bash-guard.sh "$(bash_call "git add *")" "add *"
expect allow bash-guard.sh "$(bash_call "git add -p module/a.kt")" "add -p with a path"

# Commit messages
expect allow bash-guard.sh "$(bash_call "git commit -F - <<'EOF'
TD  - read the message from stdin

$CO
EOF")" "commit -F - with a heredoc"
printf 'TD  - message from a file\n\n%s\n' "$CO" >"$WORK/msg file.txt"
expect allow bash-guard.sh "$(bash_call "git commit -F \"msg file.txt\"")" "commit -F with a quoted file name"
expect block bash-guard.sh "$(bash_call "git commit -m 'fix stuff, see TD  - x' -m '$CO'")" "type prefix not at the subject start"
expect allow bash-guard.sh "$(bash_call "git commit -m 'TD  - stop agents reading .env files' -m '$CO'")" ".env in a commit message"
expect allow bash-guard.sh "$(bash_call "git commit -m 'TD  - note about the tdd-state dir' -m '$CO'")" "tdd-state in a commit message"
expect allow bash-guard.sh "$(bash_call "git commit -m \"TD  - fix the user's view\" -m '$CO'")" "apostrophe in a commit message"

# psql only as a command
expect allow bash-guard.sh "$(bash_call "grep -rn psql docs")" "psql as a grep argument"
expect block bash-guard.sh "$(bash_call "docker compose exec db psql -U uliss")" "psql in docker compose exec"

# Containers
expect ask bash-guard.sh "$(bash_call "docker compose -f infra/docker-compose.yml down")" "docker compose down"
expect ask bash-guard.sh "$(bash_call "docker stop uliss-note")" "docker stop"
expect ask bash-guard.sh "$(bash_call "docker compose run --rm note")" "docker compose run"
expect ask bash-guard.sh "$(bash_call "npm start")" "npm start"
expect block bash-guard.sh "$(bash_call "docker compose -f infra/docker-compose.yml config")" "compose config prints env values"
expect allow bash-guard.sh "$(bash_call "docker compose -f infra/docker-compose.yml logs note")" "compose logs"

# Env files through globs
expect block bash-guard.sh "$(bash_call "cat infra/.e*")" "glob that matches .env"
expect block file-guard.sh "$(jq -n '{hook_event_name: "PreToolUse", tool_name: "Grep",
  tool_input: {pattern: "PASSWORD", path: "/repo/infra", glob: ".env*"}}')" "Grep glob over env files"
expect allow file-guard.sh "$(jq -n '{hook_event_name: "PreToolUse", tool_name: "Grep",
  tool_input: {pattern: "x", path: "/repo/module", glob: "*.kt"}}')" "Grep glob over Kotlin"

# Discarding work
expect block bash-guard.sh "$(bash_call "git restore .")" "restore working tree"
expect block bash-guard.sh "$(bash_call "git stash drop")" "stash drop"
expect allow bash-guard.sh "$(bash_call "git restore --staged module/a.kt")" "unstage a path"

# More skipped-test forms
expect block content-guard.sh "$(jq -n --arg p "/repo/module/note/note-app/src/test/kotlin/A.kt" \
  '{hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: {file_path: $p, old_string: "@Test", new_string: "@Ignore @Test"}}')" "@Ignore"
expect block content-guard.sh "$(jq -n --arg p "/repo/module/web/src/a.test.ts" \
  '{hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: {file_path: $p, old_string: "it(", new_string: "it.skipIf(ci)("}}')" "it.skipIf"
expect block content-guard.sh "$(jq -n --arg p "/repo/module/web/src/notes/Panel.tsx" \
  '{hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: {file_path: $p, old_string: "a", new_string: "a {/* TODO */}"}}')" "TODO in tsx"
