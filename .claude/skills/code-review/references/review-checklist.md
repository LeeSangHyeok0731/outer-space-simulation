# Review Checklist

Use this checklist after loading `.claude/rules/*.md`, `CLAUDE.md`, and `AGENTS.md`.

## Architecture

- The change lives on the correct side of the Canvas boundary (DOM overlay vs 3D scene).
- Scene components are only rendered inside `<Canvas>`; no `<div>` is returned from inside it.
- `use client` stays on `Universe`; it was not sprinkled onto child scene files.
- `app/page.tsx` remains a thin entrypoint.
- No FSD layers, state library, or data layer was introduced.

## Simulation State

- Continuous per-frame values are held in refs, not `useState`.
- No `setState` is called from `useFrame` for continuous values.
- Nothing that is mutated in place is stored in React state (React Compiler may not observe the mutation).
- `useFrame` reads mutable data through a ref, not a captured prop (no stale closures).
- Structural changes (add / merge / remove a body) go through `setBodies` and produce new objects.

## Per-Frame Performance

- No `new THREE.Vector3()` (or similar allocation) per body per frame in the hot path.
- Geometries, materials, and typed arrays are `useMemo`'d on their real dependencies.
- The O(n²) physics loop did not gain new per-pair work without a stated reason.
- Grid vertex count (`segments²`) and particle counts stay within a workable budget.
- Cloned `.glb` scenes are per-instance; models are preloaded at module scope.

## Numerical Safety

- Force computation guards against near-zero distance (no unbounded `1/distSq`).
- `dt` is clamped and behavior does not silently depend on frame rate.
- `NaN` cannot enter a position/velocity vector unnoticed.
- Bound culling removes bodies for the intended reason, not as a side effect of a blow-up.

## Rendering and UI

- Types match the current R3F/three stack (`bufferAttribute` uses `args`; `<line>` is not used for three.js lines).
- Overlay follows the existing Tailwind visual language; text fits its controls.
- Pointer/context-menu contracts are preserved; the canvas still receives drags.
- `OrbitControls` distance limits remain consistent with scene scale.

## Security and Configuration

- No secrets or hosts are hardcoded (the pre-tool-use hook blocks common secret patterns; do not work around it).
- Asset paths point at files that exist in `public/`.

## Validation

- `pnpm lint`, `pnpm check-types`, and `pnpm build` are run when feasible.
- The scene was actually run and observed when behavior changed.
- If a check is skipped, the blocker and residual risk are reported.
