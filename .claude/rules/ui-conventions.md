---
description: 'React, React Three Fiber, three.js, and Tailwind conventions for outer-space-simulation TSX and style files.'
paths:
  - 'app/**/*.tsx'
  - 'app/globals.css'
  - 'components/**/*.tsx'
---

# UI Conventions

Use these rules when reviewing or implementing UI in this repository. "UI" here means two different things — the DOM overlay and the 3D scene — and they have different rules.

## Components

- TypeScript function components. `PascalCase` for components, `camelCase` for helpers.
- Props typed with `interface`; shared shapes (like `BodyData`) are exported from `Universe.tsx` and imported by scene components.
- Match nearby component style before introducing a new pattern.

## DOM Overlay (control panel, context menu)

- Tailwind CSS 4. The existing visual language is a dark glass panel: `bg-zinc-900/80`, `backdrop-blur-lg`, `rounded-2xl`, `border-white/10`. Preserve it unless a redesign is requested.
- The overlay sits above the canvas via `absolute` + `z-10`. Keep new panels within that stacking model.
- Keep text inside fixed-size controls from overflowing; sliders and labels use the existing `font-mono` + `text-[10px]` metadata style.
- No `cn()` helper and no component library exists here. Do not import one; write class strings directly, as the current code does.

## 3D Scene (inside Canvas)

- Per-frame work goes in `useFrame`. Read and mutate refs; do not allocate in the hot path — reuse a module- or ref-scoped `THREE.Vector3` instead of `new THREE.Vector3()` per frame per body.
- Dispose or memoize geometries and materials that you create imperatively. `useMemo` geometry on the values it depends on (`size`, `segments`, `radius`), as `SpacetimeGrid` and `InterstellarDisk` already do.
- `bufferAttribute` requires `args={[array, itemSize]}` in this version of the R3F/three type stack. The `count` + `array` prop form does not typecheck.
- The intrinsic `<line>` element collides with the SVG `line` type. Use drei's `<Line>` (or `<primitive object={new THREE.Line(...)} />`) rather than fighting the ref type.
- Load `.glb` assets from `public/3D/` with `useGLTF`, and call `useGLTF.preload(path)` at module scope. Clone the scene before mutating it per instance.
- Emissive materials, `AdditiveBlending`, and the starfield are the established look. Keep new scene objects consistent with it.

## Interaction

- Pointer events on scene objects come from R3F (`onPointerDown`, `onPointerOver`) and carry `ThreeEvent`. Call `e.stopPropagation()` when a body should swallow the event.
- Right-click is used for the body context menu; the container suppresses the native menu with `onContextMenu={(e) => e.preventDefault()}`. Keep that contract if adding new pointer affordances.
- Camera control is drei `OrbitControls` with `makeDefault`. Respect its `minDistance`/`maxDistance` when changing scene scale.
