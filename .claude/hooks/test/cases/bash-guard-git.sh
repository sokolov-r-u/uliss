# Git rules of bash-guard.sh. Sourced by run.sh.

CO='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
GOOD_HEREDOC="git commit -m \"\$(cat <<'EOF'
TD  - guard git commands

Mentions kill, psql and git push in the body.

$CO
EOF
)\""

# Commits
expect block bash-guard.sh "$(bash_call "git commit -m 'TD  - x' -m '$CO'" "$MAIN")" "commit on main"
expect allow bash-guard.sh "$(bash_call "git commit -m 'TD  - add x' -m '$CO'")" "commit on task branch"
expect allow bash-guard.sh "$(bash_call "$GOOD_HEREDOC")" "heredoc commit with prose mentioning blocked words"
expect block bash-guard.sh "$(bash_call "git commit -m 'fix stuff' -m '$CO'")" "commit without type prefix"
expect block bash-guard.sh "$(bash_call "git commit -m 'TD - one space' -m '$CO'")" "commit with one space before dash"
expect block bash-guard.sh "$(bash_call "git commit -m 'TD  - add x'")" "commit without Co-Authored-By"
expect block bash-guard.sh "$(bash_call "git commit")" "commit without message opens an editor"
expect block bash-guard.sh "$(bash_call "git commit --amend -m 'TD  - x' -m '$CO'")" "amend"

# Staging
expect block bash-guard.sh "$(bash_call "git add -A")" "add -A"
expect block bash-guard.sh "$(bash_call "git add .")" "add ."
expect block bash-guard.sh "$(bash_call "git add --all")" "add --all"
expect block bash-guard.sh "$(bash_call "git add -u")" "add -u"
expect block bash-guard.sh "$(bash_call "cd module && git add .")" "add . in a compound command"
expect allow bash-guard.sh "$(bash_call "git add module/a.kt docs/x.md")" "add explicit paths"
expect allow bash-guard.sh "$(bash_call "git add .claude/hooks/bash-guard.sh")" "add a dot-directory path"

# Branches and worktrees
expect block bash-guard.sh "$(bash_call "git checkout main")" "checkout branch"
expect block bash-guard.sh "$(bash_call "git checkout -b x")" "checkout -b"
expect block bash-guard.sh "$(bash_call "git switch main")" "switch"
expect block bash-guard.sh "$(bash_call "git worktree add ../x")" "worktree"
expect allow bash-guard.sh "$(bash_call "git branch --show-current")" "show current branch"

# History and remote
expect block bash-guard.sh "$(bash_call "git push")" "push"
expect block bash-guard.sh "$(bash_call "git -C . push origin x")" "push with -C"
expect block bash-guard.sh "$(bash_call "git reset --hard")" "reset"
expect block bash-guard.sh "$(bash_call "git rebase main")" "rebase"
expect block bash-guard.sh "$(bash_call "git revert abc")" "revert"
expect block bash-guard.sh "$(bash_call "git tag v1")" "tag"
expect block bash-guard.sh "$(bash_call "git merge x")" "merge"
expect block bash-guard.sh "$(bash_call "git cherry-pick abc")" "cherry-pick"
expect block bash-guard.sh "$(bash_call "git branch -D x")" "branch -D"
expect block bash-guard.sh "$(bash_call "git clean -fd")" "clean"
expect allow bash-guard.sh "$(bash_call "git status && git log --oneline -5")" "read-only git"
expect allow bash-guard.sh "$(bash_call "git diff main...HEAD")" "diff against main"

# Processes and database
expect block bash-guard.sh "$(bash_call "kill 123")" "kill"
expect block bash-guard.sh "$(bash_call "lsof -ti :8080 | xargs kill")" "xargs kill"
expect block bash-guard.sh "$(bash_call "pkill java")" "pkill"
expect block bash-guard.sh "$(bash_call "killall node")" "killall"
expect block bash-guard.sh "$(bash_call "docker exec db psql -U uliss")" "psql inside docker exec"
expect allow bash-guard.sh "$(bash_call "grep -rn kill src")" "kill as a grep argument"
expect allow bash-guard.sh "$(bash_call "./gradlew :note:test")" "gradle test"
