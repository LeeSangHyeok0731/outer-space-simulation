#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-auto}"

case "$MODE" in
  staged)
    FILES=$(git diff --staged --name-only --diff-filter=ACMRD)
    ;;
  unstaged)
    FILES=$(git diff --name-only --diff-filter=ACMRD)
    ;;
  auto)
    FILES=$(git diff --staged --name-only --diff-filter=ACMRD)
    if [ -z "$FILES" ]; then
      FILES=$(git diff --name-only --diff-filter=ACMRD)
    fi
    ;;
  *)
    echo "Usage: $0 [auto|staged|unstaged]" >&2
    exit 1
    ;;
esac

if [ -z "$FILES" ]; then
  echo "none"
  exit 0
fi

printf '%s\n' "$FILES" | awk '
  /^components\/Simulation\// { print "simulation"; next }
  /^components\// { print "ui"; next }
  /^app\/.*\.css$/ { print "ui"; next }
  /^app\// { print "app"; next }
  /^public\// { print "assets"; next }
  /^\.claude\// { print "harness"; next }
  /^\.github\// { print "ci"; next }
  /^(README|CLAUDE|AGENTS|docs\/)/ { print "docs"; next }
  /^(package\.json|pnpm-lock\.yaml|tsconfig|eslint\.config|next\.config|postcss|\.editorconfig|\.gitignore)/ { print "config"; next }
  { print "global" }
' | sort -u
