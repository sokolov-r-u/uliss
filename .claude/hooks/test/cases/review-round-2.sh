# Regressions and bypasses found in the second code review. Sourced by run.sh.

CO='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

# Quoted regex and jq text is not an env glob
expect allow bash-guard.sh "$(bash_call "jq '.[] | .name' package.json")" "jq filter"
expect allow bash-guard.sh "$(bash_call "grep -rnE \"class .*Service\" module")" "regex with .*"
expect allow bash-guard.sh "$(bash_call "sed 's/\\.[^.]*\$//' f")" "sed with a dot class"
expect allow bash-guard.sh "$(bash_call "awk '/^## .*/ {print}' docs/DECISIONS.md")" "awk regex"

# Hyphenated read-only git commands
expect allow bash-guard.sh "$(bash_call "git merge-base HEAD origin/main")" "merge-base"
expect allow bash-guard.sh "$(bash_call "git log \$(git merge-base HEAD origin/main)..HEAD")" "merge-base in a substitution"
expect allow bash-guard.sh "$(bash_call "git checkout-index -a")" "checkout-index"

# Commit messages
expect allow bash-guard.sh "$(bash_call "git commit -m \"\$(cat <<'EOF'
TD  - handle \"quoted\" names

$CO
EOF
)\"")" "heredoc message with double quotes"
expect allow bash-guard.sh "$(bash_call "git commit -m 'TD  - guard \`git push\` in hooks' -m '$CO'")" "backticks inside a single-quoted message"
expect allow bash-guard.sh "$(bash_call "grep -rn 'never \`git push\`' CLAUDE.md")" "backticks inside a single-quoted pattern"
expect allow bash-guard.sh "$(bash_call "git commit -m 'TD  - support -F path in guard' -m '$CO'")" "-F inside the message"
expect allow bash-guard.sh "$(bash_call "mkdir -m 755 build/x && git commit -m 'TD  - x' -m '$CO'")" "-m of another command"
expect allow bash-guard.sh "$(bash_call "git commit -sm 'TD  - x' -m '$CO'")" "combined -sm"
expect block bash-guard.sh "$(bash_call "git commit \\
  --amend -m 'TD  - x' -m '$CO'")" "amend on a continuation line"
expect block bash-guard.sh "$(bash_call "git commit -m 'TD  - x' -m '$CO' && git commit --amend --no-edit")" "amend in a second commit"
expect block bash-guard.sh "$(bash_call "git commit \\
-a -m 'TD  - x' -m '$CO'")" "commit -a on a continuation line"
expect block bash-guard.sh "$(bash_call "git add \\
-A")" "add -A on a continuation line"
expect allow bash-guard.sh "$(bash_call "git commit --allow-empty -m 'TD  - x' -m '$CO'")" "allow-empty is not --all"

# Restore and compose
expect allow bash-guard.sh "$(bash_call "git restore -S module/a.kt")" "restore -S"
expect allow bash-guard.sh "$(bash_call "docker compose -f config/compose.yml ps")" "config as a path"

# Wrappers and combined flags
expect block bash-guard.sh "$(bash_call "bash -lc 'git push'")" "bash -lc"
expect block bash-guard.sh "$(bash_call "lsof -ti :8080 | xargs -I {} kill {}")" "xargs -I value"
expect block bash-guard.sh "$(bash_call "git branch -df x")" "branch -df"
expect block bash-guard.sh "$(bash_call "git add -Av")" "add -Av"
expect block bash-guard.sh "$(bash_call "nice git push")" "nice wrapper"
expect block bash-guard.sh "$(bash_call "exec git push")" "exec wrapper"
expect block bash-guard.sh "$(bash_call "git pull")" "pull"
expect block bash-guard.sh "$(bash_call "gh pr merge 12 --squash")" "gh pr merge"
expect allow bash-guard.sh "$(bash_call "git branch -a")" "list branches"

# Dev servers
expect ask bash-guard.sh "$(bash_call "npm -w @uliss/web run dev")" "npm -w before run"
expect ask bash-guard.sh "$(bash_call "npm run -w @uliss/web dev")" "npm run -w dev"
expect ask bash-guard.sh "$(bash_call "npm run visual:serve -w @uliss/web")" "visual:serve"
expect ask bash-guard.sh "$(bash_call "npx vite")" "npx vite"
expect allow bash-guard.sh "$(bash_call "npx vite build")" "npx vite build"
expect allow bash-guard.sh "$(bash_call "npm run test -w @uliss/web")" "npm run test"

# Disabled variants
expect block content-guard.sh "$(jq -n --arg p "/repo/module/note/note-app/src/test/kotlin/A.kt" \
  '{hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: {file_path: $p, old_string: "@Test", new_string: "@DisabledOnOs(OS.MAC) @Test"}}')" "@DisabledOnOs"

# Grep globs over env files
for g in '*.env*' '**/*env*' '.env.development'; do
  expect block file-guard.sh "$(jq -n --arg g "$g" '{hook_event_name: "PreToolUse", tool_name: "Grep",
    tool_input: {pattern: "x", path: "/repo/infra", glob: $g}}')" "Grep glob $g"
done

