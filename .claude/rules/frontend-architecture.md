---
description: 'Project structure, ownership, and React/React Three Fiber boundaries for outer-space-simulation source files.'
paths:
  - 'app/**/*'
  - 'components/**/*'
  - 'CLAUDE.md'
  - 'AGENTS.md'
---

# Frontend Architecture Rules

Use these rules as the authoritative architecture checklist for this repository.

## Read the Next.js Docs First

`AGENTS.md` is binding: this Next.js version has breaking changes from common training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code (routing, metadata, config, server/client boundaries).

## Structure

```text
app/                    Next.js App Router entrypoints
components/Simulation/  the 3D simulation (client-only)
public/3D/              .glb model assets
```

- `app/layout.tsx`: html shell, fonts, global metadata.
- `app/page.tsx`: route entrypoint. Keep it thin — it renders `<Universe />` and nothing else.
- `components/Simulation/Universe.tsx`: owns simulation state, the DOM UI overlay, the R3F `<Canvas>`, and the physics loop.
- `components/Simulation/CelestialBody.tsx`, `SpacetimeGrid.tsx`, `OrbitPath.tsx`: rendering of individual scene objects.
- Imports resolve through the `@/` alias, rooted at the repository root (`@/components/Simulation/Universe`).

There are no `src/`, feature, or entity layers. Do not introduce them for a project this size.

## Canvas Boundary

The single most important boundary in this codebase:

- Components under `components/Simulation/` other than `Universe` render **inside** `<Canvas>`. They may use R3F hooks (`useFrame`, `useThree`) and three.js intrinsic elements (`<mesh>`, `<points>`, `<line>`).
- They must never be rendered into the DOM tree, and DOM elements (`<div>`, Tailwind-styled markup) must never be returned from inside `<Canvas>`. Use drei's `Html` if DOM inside the scene is ever required.
- `Universe` straddles the boundary: the overlay UI is DOM, the scene is Canvas. Keep the two clearly separated within the file.
- `use client` belongs on `Universe` only; children inherit it. Do not add `use client` to every scene file out of habit.

## State Ownership

Two kinds of state exist, and they must not be confused:

- **Simulation state** (positions, velocities — mutated every frame): lives in refs and three.js objects. It is mutated inside `useFrame` and must not drive React re-renders.
- **React state** (`useState`): only what the DOM UI must re-render on — body count, selected body, grid settings, panel visibility.

Never call `setState` from inside `useFrame` on a per-frame basis. Structural changes (a body is added, merged, or removed) may set state; continuous values must not.

`reactCompiler: true` is enabled in `next.config.ts`. The compiler memoizes aggressively, so mutating an object that is also held in React state is unsafe — it may not observe the mutation. Simulation values that are mutated in place belong in refs, not in `useState`.

## Change Scope

- Make the smallest change that satisfies the user request.
- Do not refactor adjacent code unless the current change makes it necessary.
- Do not move files just to make the structure look cleaner.
- Add abstractions only when they remove real duplication.
