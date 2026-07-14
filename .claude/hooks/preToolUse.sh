#!/bin/bash

INPUT=$(cat)

# Extract a JSON field by dotted path (e.g. .tool_input.file_path).
# Prefer jq; fall back to node (guaranteed in this Node project) so the hook
# still works where jq is unavailable. No-op only if both are missing.
json_get() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$1 // empty"
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$INPUT" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{const o=JSON.parse(s);
          let v=o;for(const k of process.argv[1].replace(/^\./,"").split(".")){v=v==null?undefined:v[k];}
          process.stdout.write(v==null?"":String(v));
        }catch(e){process.stdout.write("");}
      });' "$1"
  fi
}

if ! command -v jq >/dev/null 2>&1 && ! command -v node >/dev/null 2>&1; then
  exit 0
fi

TOOL_NAME=$(json_get '.tool_name')

# secret-guard: block writing credentials into source files (skip .env by convention).
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  FILE_PATH=$(json_get '.tool_input.file_path')
  case "$FILE_PATH" in
    *.env*) exit 0 ;;
  esac

  CONTENT=$(json_get '.tool_input.content')
  [[ -z "$CONTENT" ]] && CONTENT=$(json_get '.tool_input.new_string')
  SECRET_PATTERNS=(
    "AKIA[0-9A-Z]{16}"
    "ghp_[A-Za-z0-9]{36}"
    "ghs_[A-Za-z0-9]{36}"
    "github_pat_[A-Za-z0-9_]{82}"
    "sk-[A-Za-z0-9]{48}"
    "sk-proj-[A-Za-z0-9_-]{50,}"
    "-----BEGIN[[:space:]]*(RSA[[:space:]]*|EC[[:space:]]*|OPENSSH[[:space:]]*)?PRIVATE KEY-----"
    "xox[baprs]-[A-Za-z0-9-]+"
  )
  for pattern in "${SECRET_PATTERNS[@]}"; do
    # -- is required: the PRIVATE KEY pattern starts with '-' and grep would parse it as an option.
    if printf '%s' "$CONTENT" | grep -qE -- "$pattern"; then
      echo "[Harness Hook] Potential secret detected in $(basename "$FILE_PATH"). Review before writing." >&2
      exit 2
    fi
  done
  exit 0
fi

if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

COMMAND=$(json_get '.tool_input.command')
CWD=$(json_get '.cwd')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="$CWD/.claude/command.log"

mkdir -p "$(dirname "$LOG_FILE")"
echo "[$TIMESTAMP] $COMMAND" >> "$LOG_FILE"

BLOCKED_PATTERNS=(
  "rm -rf[[:space:]]*/"
  "sudo rm"
  "> /dev/"
  "dd if="
  "mkfs"
  "curl.*\\|[[:space:]]*sh"
  "wget.*\\|[[:space:]]*sh"
  "git reset --hard"
  "git checkout --"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if [[ "$COMMAND" =~ $pattern ]]; then
    echo "[Harness Hook] Blocked dangerous command: $COMMAND" >&2
    exit 2
  fi
done

exit 0
