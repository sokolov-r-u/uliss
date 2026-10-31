# App launch and env file rules of bash-guard.sh and file-guard.sh. Sourced by run.sh.

file_call() {
  jq -n --arg t "$1" --arg p "$2" \
    '{hook_event_name: "PreToolUse", session_id: "s1", tool_name: $t, tool_input: {file_path: $p, path: $p}}'
}

# Launching applications asks the user first
expect ask bash-guard.sh "$(bash_call "./gradlew :note:bootRun")" "bootRun"
expect ask bash-guard.sh "$(bash_call "java -jar module/auth/build/libs/auth.jar")" "java -jar"
expect ask bash-guard.sh "$(bash_call "docker compose -f infra/docker-compose.yml --profile full up -d")" "docker compose up"
expect ask bash-guard.sh "$(bash_call "docker-compose up")" "docker-compose up"
expect ask bash-guard.sh "$(bash_call "npm run dev -w @uliss/web")" "npm run dev"
expect ask bash-guard.sh "$(bash_call "npm run preview -w @uliss/web")" "npm run preview"
expect allow bash-guard.sh "$(bash_call "npm run build -w @uliss/web")" "npm run build"
expect allow bash-guard.sh "$(bash_call "./gradlew buildAllImages")" "build images"
expect allow bash-guard.sh "$(bash_call "docker compose -f infra/docker-compose.yml ps")" "docker compose ps"

# Env files are never read through the shell
expect block bash-guard.sh "$(bash_call "cat infra/.env")" "cat .env"
expect block bash-guard.sh "$(bash_call "source infra/.env && echo ok")" "source .env"
expect block bash-guard.sh "$(bash_call "grep DB_ \"infra/.env.local\"")" "grep a quoted .env.local"
expect allow bash-guard.sh "$(bash_call "cat infra/.env.example")" "cat .env.example"
expect allow bash-guard.sh "$(bash_call "node -e 'console.log(process.env.HOME)'")" "process.env is not a file"

# Env files are never read or written through file tools
expect block file-guard.sh "$(file_call Read /repo/infra/.env)" "Read .env"
expect block file-guard.sh "$(file_call Read /repo/.env.production)" "Read .env.production"
expect block file-guard.sh "$(file_call Edit /repo/infra/.env)" "Edit .env"
expect block file-guard.sh "$(file_call Write /repo/infra/.env.local)" "Write .env.local"
expect block file-guard.sh "$(file_call Grep /repo/infra/.env)" "Grep in .env"
expect allow file-guard.sh "$(file_call Read /repo/infra/.env.example)" "Read .env.example"
expect allow file-guard.sh "$(file_call Read /repo/module/web/src/env.ts)" "Read env.ts"
expect allow file-guard.sh "$(file_call Read /repo/.envrc)" "Read .envrc"
