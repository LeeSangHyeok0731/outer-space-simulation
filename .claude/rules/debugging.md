---
description: 'Root-cause debugging, boundary tracing, and fix discipline rules for outer-space-simulation bugs, validation failures, and scripts.'
paths:
  - 'app/**/*'
  - 'components/**/*'
  - 'lib/**/*'
  - 'state/**/*'
  - '.claude/**/*.sh'
  - '.claude/skills/systematic-debugging/**/*'
---

# Debugging Rules

Use these rules for bugs, build failures, type errors, and unexpected simulation behavior.

## Root Cause First

Do not patch symptoms before identifying the likely root cause.

Before changing code:

1. Read the full error output.
2. Reproduce the issue or identify why it cannot be reproduced. For physics bugs, `lib/sim/*.test.ts` runs without a browser — write a failing Vitest case before touching `pnpm dev`.
3. Check recent diffs and relevant call sites.
4. Compare the broken path with a working local pattern.
5. State one specific hypothesis before editing.

## Boundary Tracing

Most bugs here live on one of the three architecture boundaries (see `frontend-architecture.md`). Trace the whole chain before editing.

For a body that renders wrong, or not at all:

```text
engine.bodies (Float64Array, lib/sim/bodies.ts) -> Bodies.tsx useFrame reads b.posX/posY/posZ/radius/color
  -> mesh.setMatrixAt / setColorAt -> instanceMatrix.needsUpdate -> what the camera sees
```

For a body that moves wrong (drifts, explodes, vanishes):

```text
spawn() initial position/velocity -> computeAccelerations() pairwise force (lib/sim/integrator.ts)
  -> integrate() leapfrog kick/drift/kick -> resolveCollisions() merge -> sanitize() NaN/Infinity cull
  -> next substep()
```

For UI that does not update:

```text
useState in state/SimulationProvider.tsx -> useSimulation() context read
  -> does the DOM component read it (not the engine's Float64Array directly)? -> was a re-render actually triggered?
```

## Simulation-Specific Suspects

Check these before blaming React:

- **Body position/velocity ever assigned into `useState` or a plain-object ref.** It must live only in `engine.bodies`' typed arrays. This is the standing rule in `frontend-architecture.md` — a violation here is close to always the root cause of "state gets out of sync" bugs.
- **Stale closure in `useFrame`.** The callback captures the render it was created in. Read mutable data through `engine.bodies` / a ref (as `CameraRig.tsx` and `Bodies.tsx` do), not a captured prop.
- **Numerical blow-up despite softening.** Gravity is `F = G·m1·m2/(r²+ε²)^1.5` (`SOFTENING = 0.5` in `lib/sim/units.ts`) — softening means near-zero distance no longer trivially explodes, but extreme mass ratios, a bad merge, or a long `MAX_SUBSTEPS`-starved catch-up can still produce non-finite values. There is no bound cull in this codebase (no far-distance despawn); a body that vanishes was removed by `SimulationEngine.sanitize()`, not by leaving a boundary. Check for the `[sim] 오염된 천체 제거` console warning before assuming a render bug.
- **Frame-rate dependence.** Real `useFrame` delta is clamped to `MAX_FRAME_DT = 0.05`s in `engine.step()` and then run through a fixed `FIXED_DT = 1/120` accumulator (`MAX_SUBSTEPS = 32` per frame). Behavior that reproduces on only one machine is usually a raw-`delta` assumption that bypassed this accumulator.
- **NaN propagation.** A single `NaN`/`Infinity` position, once introduced, spreads to every other body within the same `computeAccelerations()` call (it's O(N²) pairwise). `sanitize()` runs at the start and end of every `substep()` for exactly this reason — see the "알려진 한계" note in `lib/sim/engine.ts` and design doc §4 for the one gap it doesn't cover (overflow occurring inside `integrate()`'s own internal recompute).

## Fix Discipline

- Make one root-cause fix at a time.
- Do not bundle cleanup with a bug fix.
- If two fix attempts fail, stop and re-evaluate the hypothesis.
- Verify a physics fix with a Vitest case in `lib/sim/*.test.ts` first; verify a rendering/interaction fix by running `pnpm dev` and watching the behavior, not only by typechecking.
