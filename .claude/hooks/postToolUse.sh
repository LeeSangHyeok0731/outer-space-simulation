#!/bin/bash

INPUT=$(cat)

# Extract a JSON field by dotted path; prefer jq, fall back to node.
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

if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

FILE_PATH=$(json_get '.tool_input.file_path')
CWD=$(json_get '.cwd')

case "$FILE_PATH" in
  *.js | *.jsx | *.mjs | *.ts | *.tsx)
    # Call eslint's JS entrypoint with node: spawning the .cmd shim fails on Windows.
    ESLINT="$CWD/node_modules/eslint/bin/eslint.js"
    [[ -f "$ESLINT" ]] || exit 0

    echo "[Harness Hook] Running eslint --fix for $(basename "$FILE_PATH")" >&2
    if node "$ESLINT" --fix "$FILE_PATH" >&2 2>&1; then
      echo "[Harness Hook] eslint OK" >&2
    else
      echo "[Harness Hook] eslint reported issues (see output above)" >&2
    fi
    ;;
esac

exit 0
