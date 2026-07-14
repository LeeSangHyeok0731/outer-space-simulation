---
name: code-review
description: 'Review outer-space-simulation changed files using dynamically discovered .claude/rules, the Canvas boundary, simulation-state vs React-state ownership, per-frame performance, three.js resource handling, and validation results. Use for code review requests, staged diff review, pre-PR review, and after multi-file implementation.'
---

# Code Review

Use this skill for structured review of changed source or harness files.

## Step 1: Load Rules

Discover rules dynamically:

```bash
find .claude/rules -name "*.md" 2>/dev/null
```

Read every returned file. Rules in `CLAUDE.md` and `AGENTS.md` still apply; if rules conflict, use this priority:

```text
AGENTS.md > CLAUDE.md > .claude/rules/** > nearby source patterns
```

For multi-file reviews or pre-PR checks, also read `${CLAUDE_SKILL_DIR}/references/review-checklist.md`.

## Step 2: Determine Review Scope

- Staged review: `git diff --staged`
- Working tree review: `git diff`
- Branch review: compare with `main` when available
- File-specific review: inspect the named files and direct dependencies

## Step 3: Review Checklist

Check only what is relevant to the changed files:

- Canvas boundary: DOM elements are not returned from inside `<Canvas>`, and scene components are not rendered outside it.
- State ownership: no per-frame `setState`; nothing mutated in place while stored in `useState`.
- `useFrame` correctness: no stale closures, no allocations in the hot path, `delta` handled.
- three.js resources: geometries/materials memoized or disposed; cloned models not shared between instances.
- Numerical safety: division by near-zero distance, `NaN` propagation, frame-rate dependence.
- Typing against the current R3F/three stack (`bufferAttribute` `args`, `<line>` vs SVG).
- Overlay UI: existing Tailwind visual language preserved, controls readable, pointer events not stolen from the canvas.
- Validation commands run, and residual risk.

## Report Format

Lead with findings:

```markdown
## Findings

- [High|Medium|Low] `path:line` — issue, impact, and suggested fix.

## Open Questions

- Only include real blockers or assumptions.

## Checks

- Commands and static checks performed.
```

If no issues are found, state that clearly and mention what was not verified (typically: actual rendered behavior, frame rate under load).
