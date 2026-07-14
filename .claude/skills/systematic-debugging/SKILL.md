---
name: systematic-debugging
description: 'Investigate outer-space-simulation bugs, build failures, lint failures, type errors, runtime errors, rendering problems, and bodies behaving strangely by finding root cause before fixes. Use whenever debugging, build failure, regression, or unclear behavior is mentioned.'
---

# Systematic Debugging

Use this skill before fixing bugs or validation failures.

## Rule

Find root cause before editing code. A quick patch that only hides the symptom is not a fix.

## Phase 1: Evidence

1. Read the full error, warning, stack trace, or user reproduction.
2. Identify whether the issue is reproducible. For simulation bugs, note whether it happens immediately, only after N bodies, or only after time passes.
3. Inspect recent diffs and directly related files.
4. Compare against a working local pattern.
5. State one root-cause hypothesis.

## Phase 2: Boundary Trace

Choose the relevant trace:

```text
Rendering:  bodies state -> <CelestialBody> props -> useFrame mutation -> mesh.position -> camera view
Motion:     initial position/velocity -> force accumulation -> velocityChanges -> velocity/position mutation -> bound cull
UI:         useState in Universe -> prop -> does useFrame read the live value? -> did a re-render happen?
Build/Type: first compiler error -> owning file -> import/type chain -> recent diff
```

For failures that cross more than one boundary, read `${CLAUDE_SKILL_DIR}/references/root-cause-tracing.md` before proposing a fix.

## Phase 3: Minimal Fix

- Change one thing that addresses the hypothesis.
- Do not bundle cleanup or refactors.
- There is no test framework in this repository. Document the smallest command or manual path (which control to click, what to watch) that verifies the fix.

## Phase 4: Verification

Run the smallest meaningful check first, then the broader gate:

```bash
pnpm lint
pnpm check-types
pnpm build
```

Then run `pnpm dev` and watch the actual behavior — a passing typecheck says nothing about whether a body still orbits.

If a check cannot run because of environment constraints, report the constraint separately from code risk.
