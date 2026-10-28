# Shared helpers of tdd-record.sh and tdd-gate.sh. Sourced, not executed.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/tdd-state"

# Prints "<gradle name> <project dir>" for each project(":x").projectDir = file("dir") line.
gradle_modules() {
  sed -nE 's/^project\(":([^"]+)"\)\.projectDir = file\("([^"]+)"\).*/\1 \2/p' \
    "$PROJECT_DIR/settings.gradle.kts" 2>/dev/null
}

# Prints the Gradle name of the module that owns a path, using the longest matching directory.
module_of() {
  local rel="${1#"$PROJECT_DIR"/}" best="" best_len=0 name dir
  while read -r name dir; do
    case "$rel" in
      "$dir"/*)
        if [ "${#dir}" -gt "$best_len" ]; then
          best="$name"
          best_len=${#dir}
        fi
        ;;
    esac
  done < <(gradle_modules)
  printf '%s' "$best"
}

state_file() {
  printf '%s/%s.json' "$STATE_DIR" "$1"
}
