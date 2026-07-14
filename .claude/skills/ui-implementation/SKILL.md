---
name: ui-implementation
description: 'Implement outer-space-simulation UI: the Tailwind DOM overlay (control panel, context menu) and React Three Fiber scene objects (meshes, points, materials, models). Use for panels, controls, visual fixes, scene objects, and rendering changes.'
---

# UI Implementation

Use this skill when building or changing anything the user sees. Two surfaces exist and they have different rules: the **DOM overlay** and the **3D scene**.

## Component Rules

- TypeScript React function components with `export default function`, matching local style.
- Type props with `interface`. Extend `BodyData` (exported from `Universe.tsx`) rather than redeclaring body fields.
- Keep hooks at the top, handlers next, `useFrame` last, then the return block.
- Reuse existing components before adding new ones.

## DOM Overlay Rules

- Tailwind CSS 4, written as direct class strings. There is no `cn()` helper and no component library — do not add one.
- Match the established look: `bg-zinc-900/80`, `backdrop-blur-lg`, `rounded-2xl`, `border-white/10`, `text-white`, `font-mono` micro-labels at `text-[10px]`.
- The panel is `absolute z-10` over a full-screen canvas. Keep new panels inside that stacking model, and keep `pointer-events` correct so the canvas still receives drags.
- Sliders follow the existing pattern: a labeled row showing the live value, then `<input type="range">` with an `accent-*` color.
- Ensure text fits its control; do not add explanatory in-app text unless asked.

## 3D Scene Rules

- Per-frame work goes in `useFrame`; never `setState` there for continuous values.
- Do not allocate in the hot path. Reuse a scoped `THREE.Vector3` instead of `new THREE.Vector3()` per body per frame.
- `useMemo` geometries and particle buffers on their real dependencies (`size`, `segments`, `radius`).
- `bufferAttribute` needs `args={[array, itemSize]}` in this version — the `count` + `array` prop form does not typecheck.
- The intrinsic `<line>` collides with SVG's `line` type. Use drei's `<Line>` instead of casting the ref.
- Load `.glb` from `public/3D/` with `useGLTF`, preload at module scope, and clone the scene per instance before mutating it.
- Keep the visual language: emissive stars, `AdditiveBlending` particles, wireframe grid, drei `Stars` background.

## Interaction Rules

- Scene pointer events are R3F `ThreeEvent`s. Call `e.stopPropagation()` when a body should consume the event.
- Right-click opens the body context menu; the container already suppresses the native menu. Preserve that contract.
- Camera is drei `OrbitControls` with `makeDefault`; respect `minDistance`/`maxDistance` when changing scene scale.

## Verification

- Run the app (`pnpm dev`) and look at it. A diff cannot tell you whether the scene renders.
- Check that adding many bodies ("+20 Planets") still runs at an acceptable frame rate.
- Check overlay behavior at narrow and wide viewports.
- Record any visual assumptions in the implementation artifact.
