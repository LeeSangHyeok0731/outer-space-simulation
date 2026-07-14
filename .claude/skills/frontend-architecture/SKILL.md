---
name: frontend-architecture
description: 'Plan and review outer-space-simulation architecture: app/ route ownership, the Canvas boundary, simulation-state vs React-state ownership, R3F component responsibilities, and minimal implementation scope. Use for any feature, refactor, routing, dependency, or architecture decision in this repository.'
---

# Frontend Architecture

Use this skill to keep changes aligned with the repository's actual structure and to prevent unnecessary refactors.

## Repository Shape

outer-space-simulation is a Next.js App Router frontend using:

- Next.js 16, React 19, TypeScript, React Compiler (`reactCompiler: true`)
- Tailwind CSS 4
- three.js with `@react-three/fiber` and `@react-three/drei`

```text
app/                    route entrypoints (layout, page, globals.css)
components/Simulation/  Universe, CelestialBody, SpacetimeGrid, OrbitPath
public/3D/              .glb assets
```

There is no `src/`, no data layer, and no server API. Do not introduce FSD layers or a state library for a project this size.

`AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing framework-level code — this Next.js version differs from common training data.

## Planning Workflow

1. Identify the user-visible behavior (what changes on screen).
2. Decide which side of the Canvas boundary it lives on:
   - DOM overlay (control panel, context menu) → the JSX above `<Canvas>` in `Universe.tsx`.
   - 3D scene → a component inside `<Canvas>`.
   - Motion/physics → `PhysicsUpdate` in `Universe.tsx`.
3. Decide which state it needs:
   - Re-render-driving UI value → `useState` in `Universe`.
   - Per-frame simulation value → ref, mutated in `useFrame`.
4. Choose the smallest component that should own the change.

## Ownership Rules

- `app/page.tsx`: renders `<Universe />`. Keep it thin.
- `app/layout.tsx`: html shell, fonts, metadata.
- `Universe.tsx`: simulation state, overlay UI, `<Canvas>`, `PhysicsUpdate`. It is the only `use client` boundary.
- `CelestialBody.tsx`: one body's mesh/model, hover and pointer handling, the black-hole accretion disk.
- `SpacetimeGrid.tsx`: the deformed grid plane.
- `OrbitPath.tsx`: per-body trail buffer.
- `BodyData` and `BodyType` are exported from `Universe.tsx`; scene components import the type from there.

## Decision Rules

- Add a new abstraction only when it removes repeated complexity.
- Do not call `setState` per frame. Structural changes (add/merge/remove a body) may set state; continuous values must not.
- Do not store objects that are mutated in place inside `useState` — React Compiler may not observe the mutation. Use refs.
- Keep the physics loop O(n²)-aware: every new per-body cost multiplies. Note the cost in the plan when adding one.
- Do not move files only to make the structure look cleaner.

## Output

Write a short plan that includes:

- Which side of the Canvas boundary the change lives on
- State ownership (React state vs ref)
- Files likely to change
- Performance risk (per-frame cost, allocations, vertex count)
- Assumptions and validation steps
