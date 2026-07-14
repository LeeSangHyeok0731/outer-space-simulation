---
description: 'React, React Three Fiber, three.js, and Tailwind conventions for outer-space-simulation TSX and style files.'
paths:
  - 'app/**/*.tsx'
  - 'app/globals.css'
  - 'components/**/*.tsx'
---

# UI Conventions

Use these rules when reviewing or implementing UI in this repository. "UI" here means two different things — the DOM overlay (`components/ui/`) and the 3D scene (`components/scene/`) — and they have different rules.

## Components

- TypeScript function components. `PascalCase` for components, `camelCase` for helpers.
- Props typed with `interface`. Shared shapes live where they're owned: engine-facing types (`BodyInit`, `SpawnOptions`, `SerializedBody`) are exported from `lib/sim/engine.ts`/`lib/sim/bodies.ts`; UI-facing shapes (`SimulationContextValue`, `SimStats`) are exported from `state/SimulationProvider.tsx`. There is no `Universe.tsx` — body data is read straight from `engine.bodies` (a `BodyBuffer`), not passed down as component props.
- Match nearby component style before introducing a new pattern.

## DOM Overlay (`components/ui/`)

- Tailwind CSS 4. The existing visual language is `slate`/`sky`, not a neutral gray: `bg-slate-950/70` (or `/80` for the selected-body card), `border-sky-400/20` (or `/30`), `backdrop-blur`, `rounded-lg` for panels and `rounded-full` for the bottom control bar. Preserve it unless a redesign is requested.
- `Overlay.tsx` is the single entry point: a `pointer-events-none absolute inset-0 z-10` wrapper positions `StatsHud` (top-left), `SpawnPanel` + `BodyCard` (top-right, stacked), and `ControlPanel` (bottom-center). Each panel opts back into `pointer-events-auto` individually so the canvas underneath still receives drag/click for throwing bodies. Keep new panels within that contract.
- Numeric/technical readouts (stats, body info card) use `font-mono` + `text-xs`; labels use `uppercase tracking-widest text-sky-300/80`.
- No `cn()` helper and no component library exists here. Do not import one; write class strings directly, as the current code does.

## 3D Scene (`components/scene/`, inside `<Canvas>`)

- Per-frame work goes in `useFrame`. Read and mutate refs; do not allocate in the hot path — reuse a module- or ref-scoped `THREE.Object3D`/`THREE.Color`/`THREE.Vector3` (see the `dummy`/`color` singletons at the top of `Bodies.tsx`) instead of `new THREE.Vector3()` per frame per body.
- `geometry.getAttribute('position')` returns a `BufferAttribute | InterleavedBufferAttribute` union in this `@types/three` version, which doesn't typecheck against plain `.array`/`.needsUpdate` writes without a cast. Don't cast — instead hold your own `THREE.BufferAttribute` in a ref, `geometry.setAttribute('position', ref.current)` once in an effect, and mutate only that ref afterward. `Trails.tsx` and `SpawnController.tsx`'s trajectory preview both do this.
- The intrinsic `<line>` element collides with the SVG `line` type. Build a `THREE.Line` yourself (`useMemo`) and mount it with `<primitive object={line} ref={...} />`, as `SpawnController.tsx`'s throw-preview does. Attach geometry attributes and dispose geometry/material in a `useEffect`, not during render.
- Dispose or memoize geometries and materials created imperatively. `useMemo` geometry/material on the values they depend on; dispose in the matching effect cleanup.
- No `.glb` assets are loaded in this codebase (the one prototype asset under `public/3D/` was removed as unreferenced). If a `.glb` is reintroduced, load it with drei's `useGLTF`, preload at module scope, and clone the scene before mutating it per instance.
- The look is `meshBasicMaterial`/`lineBasicMaterial` with `toneMapped={false}` (so materials output raw, unclamped color) plus `@react-three/postprocessing`'s `<Bloom>` in `SpaceCanvas.tsx` — not emissive materials or `AdditiveBlending`. Keep new glowing scene objects consistent with that pattern rather than introducing a different one.

## Interaction

- There is no per-object `onPointerDown`/`onPointerOver` on scene meshes and no right-click context menu (that's 2단계/God-hand-stage territory, not built yet). `SpawnController.tsx` instead attaches raw `pointerdown`/`pointermove`/`pointerup` listeners to `gl.domElement` (via `useEffect`) and does its own `raycaster.intersectObject`/`intersectPlane` picking against the ecliptic plane and the bodies `InstancedMesh`. Follow that pattern for new pointer-driven scene interaction rather than introducing R3F's per-mesh pointer props.
- Camera control is drei `OrbitControls` inside `CameraRig.tsx`. The left mouse button is deliberately left unbound (`mouseButtons` only sets `MIDDLE`/`RIGHT`) so `SpawnController` owns left-drag for throwing; respect `minDistance`/`maxDistance` when changing scene scale.
