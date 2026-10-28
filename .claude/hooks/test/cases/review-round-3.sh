# Bypasses and false positives found in the third code review. Sourced by run.sh.

CO='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

# Shell keywords and xargs before a command
expect block bash-guard.sh "$(bash_call "if true; then git commit --amend --no-edit; fi")" "amend after then"
expect block bash-guard.sh "$(bash_call "for i in 1; do git commit -a -m 'TD  - x' -m '$CO'; done")" "commit -a after do"
expect block bash-guard.sh "$(bash_call "if git commit -m 'bad'; then echo ok; fi")" "bad message after if"
expect block bash-guard.sh "$(bash_call "echo | xargs git commit --amend --no-edit")" "amend after xargs"
expect block bash-guard.sh "$(bash_call "if git push origin HEAD; then echo ok; fi")" "push after if"
expect block bash-guard.sh "$(bash_call "! git pull --rebase")" "pull after !"
expect block bash-guard.sh "$(bash_call "while git stash drop; do :; done")" "stash drop after while"

# Escaped substitutions are literal text
expect allow bash-guard.sh "$(bash_call "git commit -m \"TD  - explain \\\$(git reset) usage\" -m \"$CO\"")" "escaped \$( in a message"
expect allow bash-guard.sh "$(bash_call "git commit -m \"TD  - never \\\`git push origin\\\` here\" -m \"$CO\"")" "escaped backticks in a message"

# Stopping processes and launching servers
expect block bash-guard.sh "$(bash_call "npx kill-port 8080")" "kill-port"
expect block bash-guard.sh "$(bash_call "fuser -k 8080/tcp")" "fuser -k"
expect ask bash-guard.sh "$(bash_call "./gradlew --stop")" "gradle daemon stop"
expect ask bash-guard.sh "$(bash_call "npx vite --config visual/vite.config.ts --host 127.0.0.1")" "vite with flags"
expect ask bash-guard.sh "$(bash_call "docker volume rm uliss_postgres-data")" "docker volume rm"
expect allow bash-guard.sh "$(bash_call "./gradlew :note:test --no-daemon")" "gradle without stop"

# Heredocs piped into a shell
expect block bash-guard.sh "$(bash_call "cat <<'EOF' | sh
git push
EOF")" "heredoc piped into sh"

# Commit message from /dev/stdin
expect allow bash-guard.sh "$(bash_call "git commit -F /dev/stdin <<'EOF'
TD  - message on stdin

$CO
EOF")" "commit -F /dev/stdin"

# Many quoted strings stay fast
many=$(for i in $(seq 1 3000); do printf "'a%s' " "$i"; done)
started=$(date +%s)
expect allow bash-guard.sh "$(bash_call "echo $many")" "3000 quoted strings"
[ $(($(date +%s) - started)) -le 2 ] || { fail=$((fail + 1)); echo "FAIL [bash-guard.sh] 3000 quoted strings took over 2 s"; }
