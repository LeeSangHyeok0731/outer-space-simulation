---
name: quality-gate
description: 'Verify outer-space-simulation changes with pnpm lint, pnpm check-types, pnpm build, plus Canvas-boundary review, state-ownership review, per-frame performance review, and actually running the scene. Use after implementation, during reviews, for reruns, and whenever a task risks regressions.'
---

# Quality Gate

Use this skill to verify changes before final delivery.

## Rule Loading

Discover and read project harness rules before static review:

```bash
find .claude/rules -name "*.md" 2>/dev/null
```

Use these files together with `CLAUDE.md`, `AGENTS.md`, and nearby source patterns.

## Minimum Commands

Run these when feasible:

```bash
pnpm lint
pnpm check-types
pnpm build
```

If a command fails, inspect whether the failure is caused by the current change, the environment, or pre-existing repository state. Report those three cases separately.

## Static Review Checklist

- DOM elements are not returned from inside `<Canvas>`; scene components are not rendered outside it.
- `use client` is on `Universe` only.
- No per-frame `setState`; no in-place mutation of objects held in `useState`.
- `useFrame` reads mutable data through refs, not captured props.
- No allocations added to the per-frame hot path.
- Geometries, materials, and buffers are memoized on their real dependencies.
- Types match the current R3F/three stack (`bufferAttribute` `args`; no intrinsic `<line>` for three.js lines).

## Runtime Check

Static checks cannot tell you whether the simulation still looks right. When behavior or rendering changed:

1. Run `pnpm dev`.
2. Confirm the default sun/earth system renders and orbits.
3. Add bodies ("+20 Planets") and confirm the frame rate stays workable.
4. Exercise the changed path specifically (grid resolution, merge/black-hole promotion, context menu, camera limits).

If the scene cannot be run in this environment, say so explicitly and list it as residual risk rather than implying it was verified.

## Reporting Format

Report findings in this order:

1. Blocking issues
2. Non-blocking risks
3. Commands run
4. Residual risk

If no issues are found, say so directly and still list the checks that were run.
