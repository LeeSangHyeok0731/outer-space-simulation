# Root-Cause Tracing

Use this reference when a failure crosses more than one file or boundary.

## A Body Renders Wrong, or Not at All

Trace in this order:

```text
bodies state -> <CelestialBody {...body}> -> useFrame position copy -> mesh/model transform -> camera view
```

Check:

- The body is still in the `bodies` array (it may have been culled or merged away).
- `meshRef.current` is non-null when `useFrame` runs.
- For black holes: the `.glb` loaded, the clone is per-instance, and `scale` is not zero.
- The material is not black-on-black (emissive/`AdditiveBlending` assumptions).
- The camera's `far` plane and `OrbitControls` limits still contain the object.

## A Body Moves Wrong

Trace in this order:

```text
initial position/velocity -> pairwise force -> velocityChanges[i] -> velocity.add -> position.add -> bound cull
```

Check:

- Near-zero distance: `G*m1*m2/distSq` has no softening term, so a close pass produces an enormous impulse.
- Collision/merge ran when you did not expect it (radius sum overlap), transferring mass and momentum.
- Black-hole promotion thresholds (`DENSITY_THRESHOLD`, `MASS_THRESHOLD`) fired and changed radius.
- The bound cull (`gridSize / 2 + 100`) removed the body after a blow-up — the symptom is "it vanished", the cause is upstream.
- `dt` is the clamped frame delta; a fix that works only at 60fps is not a fix.
- A `NaN` entered a vector and silently removed the object from view.

## UI Does Not Update

Trace in this order:

```text
useState in Universe -> prop into scene component -> useFrame closure -> re-render
```

Check:

- The value is read through a ref inside `useFrame`, not captured from a stale render.
- A per-frame mutation is being made to an object that also lives in `useState` (React Compiler may not observe it).
- The state setter actually produced a new object, rather than mutating the existing one.

## Build, Type, and Lint Failures

Trace in this order:

```text
first reported error -> owning file -> import/type chain -> recent diff -> local working example
```

Check:

- The first error, before chasing later cascading errors.
- R3F/three type-stack mismatches: `bufferAttribute` requires `args`; the intrinsic `<line>` resolves to `SVGLineElement`.
- Whether `.next/` cache or generated `next-env.d.ts` is involved.
- The closest working file using the same pattern.

## Stop Conditions

Stop and re-evaluate when:

- Two attempted fixes fail.
- The hypothesis no longer explains the evidence.
- A fix would require broad architecture changes unrelated to the request.
