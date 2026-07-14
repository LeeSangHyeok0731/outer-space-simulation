---
description: 'Project structure, ownership, and React/React Three Fiber boundaries for outer-space-simulation source files.'
paths:
  - 'app/**/*'
  - 'components/**/*'
  - 'lib/**/*'
  - 'state/**/*'
  - 'CLAUDE.md'
  - 'AGENTS.md'
---

# Frontend Architecture Rules

Use these rules as the authoritative architecture checklist for this repository.

## Read the Next.js Docs First

`AGENTS.md` is binding: this Next.js version has breaking changes from common training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code (routing, metadata, config, server/client boundaries).

## Structure

```text
app/                Next.js App Router entrypoints
lib/sim/            pure TypeScript physics engine (no React, no three.js — Vitest-covered)
components/scene/   React Three Fiber (renders inside <Canvas>, reads the engine)
components/ui/      DOM overlay (Tailwind, renders outside <Canvas>)
state/              SimulationProvider: engine instance + React UI state (Context)
public/3D/          .glb model assets
docs/superpowers/specs/  living design doc — keep it in sync with the code
```

- `app/page.tsx`: route entrypoint. Thin — wraps `<SpaceCanvas />` and `<Overlay />` in `SimulationProvider` and nothing else.
- `lib/sim/engine.ts`: `SimulationEngine` — owns all body state (SoA `Float64Array`s via `BodyBuffer`), `step()`, spawn/remove/setMass/applyImpulse, serialize/load.
- `lib/sim/bodies.ts`, `integrator.ts`, `collisions.ts`, `units.ts`, `scenes.ts`, `predict.ts`: engine internals. Framework-agnostic; every file here is a Vitest target.
- `components/scene/SpaceCanvas.tsx`: the `<Canvas>` boundary. Mounts `Bodies`, `Trails`, `CameraRig`, `SpawnController`, `Starfield`, and the postprocessing `Bloom`.
- `components/scene/Bodies.tsx`: **the sole caller of `engine.step()`.** Everything else that reads engine state (`Trails`, `CameraRig`) must mount after it so it observes the same frame's update.
- `components/ui/Overlay.tsx`: composes the DOM overlay (`StatsHud`, `SpawnPanel`, `BodyCard`, `ControlPanel`) inside a `pointer-events-none` wrapper; only the panels themselves are `pointer-events-auto`.
- `state/SimulationProvider.tsx`: creates the one `SimulationEngine` instance (`useState(() => new SimulationEngine())`, identity never changes) and owns the React Context (`useSimulation()`) that both the scene and the overlay read from.
- Imports resolve through the `@/` alias, rooted at the repository root (`@/lib/sim/engine`, `@/state/SimulationProvider`).

There are no `src/`, feature, or entity layers. Do not introduce them for a project this size.

## Canvas Boundary

The most important boundary in this codebase is now **three layers**, not two:

```text
lib/sim/ (pure TS engine, owns all physics state)
   -> components/scene/ (R3F, inside <Canvas>, reads the engine every frame)
   -> components/ui/ (DOM, outside <Canvas>, reads derived React state)
```

- `lib/sim/` must never import React or three.js.
- Components under `components/scene/` render **inside** `<Canvas>` (mounted by `SpaceCanvas.tsx`). They may use R3F hooks (`useFrame`, `useThree`) and three.js intrinsic elements (`<instancedMesh>`, `<lineSegments>`, `<mesh>`). They must never return DOM markup. Use drei's `Html` if DOM inside the scene is ever required.
- Components under `components/ui/` render as a sibling of the `<Canvas>` (the `<Overlay />` in `app/page.tsx`), never inside it, and must never import three.js or use R3F hooks.
- `use client` is required on every file here that uses hooks or browser APIs — this project has no single root component that centralizes it the way an all-in-one `Universe.tsx` design would.

## State Ownership

Two kinds of state exist, and they must not be confused:

- **Simulation state** (positions, velocities, mass, radius, body count — mutated every physics substep): lives **only** inside `SimulationEngine`'s typed-array buffers (`BodyBuffer` in `lib/sim/bodies.ts`). It never enters `useState`, and no plain object mirroring it is held in a React ref either — `Bodies.tsx`'s `useFrame` reads the arrays directly each frame and writes straight into the `InstancedMesh` matrices/colors. Zero re-renders for this data, ever.
- **React state** (`useState` in `state/SimulationProvider.tsx`): paused, timeScale, spawn mass/preset, trail toggle, selected body id, and the 10Hz-sampled display stats (`count`/`simTime`/`fps`). This is what the DOM overlay re-renders on.
- **Camera**: owned by three.js (`OrbitControls` inside `CameraRig.tsx`), not React state.

Never call `setState` from inside `useFrame` on a per-frame basis — `Bodies.tsx` samples display stats at 10Hz specifically to avoid this. UI-driven changes go through `SimulationProvider`'s setters, which call the engine imperatively (`engine.paused = v`, `engine.timeScale = v`) and update React state in the same call; the engine itself never triggers a re-render.

`reactCompiler` is enabled and rejects two patterns this project runs into on purpose:

- `react-hooks/refs`: writing to a `.current` ref (or an engine field) during render — only effects, event handlers, and `useFrame` may do it. See the `// eslint-disable-next-line react-hooks/immutability` lines in `SimulationProvider.tsx` where `engine.paused`/`engine.timeScale` are mutated imperatively outside of render.
- `set-state-in-effect`: calling `setState` synchronously in a `useEffect` body outside an event/interval callback. See the guard comment in `BodyCard.tsx` explaining why it does not call `setInfo(null)` directly when `selectedId` becomes `null` — the render guard already short-circuits that case.

## Change Scope

- Make the smallest change that satisfies the user request.
- Do not refactor adjacent code unless the current change makes it necessary.
- Do not move files just to make the structure look cleaner.
- Add abstractions only when they remove real duplication.
