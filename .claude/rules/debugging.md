---
description: 'Root-cause debugging, boundary tracing, and fix discipline rules for outer-space-simulation bugs, validation failures, and scripts.'
paths:
  - 'app/**/*'
  - 'components/**/*'
  - '.claude/**/*.sh'
  - '.claude/skills/systematic-debugging/**/*'
---

# Debugging Rules

Use these rules for bugs, build failures, type errors, and unexpected simulation behavior.

## Root Cause First

Do not patch symptoms before identifying the likely root cause.

Before changing code:

1. Read the full error output.
2. Reproduce the issue or identify why it cannot be reproduced.
3. Check recent diffs and relevant call sites.
4. Compare the broken path with a working local pattern.
5. State one specific hypothesis before editing.

## Boundary Tracing

Most bugs here live on one of three boundaries. Trace the whole chain before editing.

For a body that renders wrong, or not at all:

```text
bodies state (Universe) -> <CelestialBody {...body}> -> useFrame mutation -> mesh.position -> what the camera sees
```

For a body that moves wrong (drifts, explodes, vanishes):

```text
initial position/velocity -> PhysicsUpdate force accumulation -> velocityChanges -> b.velocity/b.position mutation -> next frame
```

For UI that does not update:

```text
useState in Universe -> prop into scene component -> does useFrame read the current value? -> was a re-render actually triggered?
```

## Simulation-Specific Suspects

Check these before blaming React:

- **A value mutated in place but stored in `useState`.** `reactCompiler` is on; memoization can hide the mutation. This is the standing structural risk in `Universe.tsx`.
- **Stale closure in `useFrame`.** The callback captures the render it was created in. Read mutable data through a ref (`bodiesRef.current`), not a captured prop.
- **Numerical blow-up.** Gravity is `G*m1*m2/distSq` with no softening term: as `dist` approaches zero the force explodes, the body is flung past the bound and then culled. If a body "disappears", check the bound cull in `PhysicsUpdate` before assuming a render bug.
- **Frame-rate dependence.** `dt` is the `useFrame` delta, clamped to `0.1`. Behavior that reproduces on only one machine is usually a `dt` assumption.
- **NaN propagation.** A single `NaN` position silently removes an object from view. Log the vector; do not guess.

## Fix Discipline

- Make one root-cause fix at a time.
- Do not bundle cleanup with a bug fix.
- If two fix attempts fail, stop and re-evaluate the hypothesis.
- Verify a simulation fix by running `pnpm dev` and watching the behavior, not only by typechecking.
