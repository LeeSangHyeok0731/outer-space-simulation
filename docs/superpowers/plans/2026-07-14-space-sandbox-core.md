# 우주 샌드박스 1단계 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 천체를 던지면 서로 끌어당기고 병합하는, 수백 개 규모의 N-body 우주 샌드박스를 만든다.

**Architecture:** 물리는 React·three.js를 모르는 순수 TypeScript 엔진(`lib/sim/`)이 `Float64Array` SoA로 소유하고, R3F는 매 프레임 그 배열을 읽어 단일 `InstancedMesh`에 그리기만 한다. 천체 상태는 절대 React state에 들어가지 않으며, UI state(배속·일시정지·선택)만 React가 소유한다.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, TypeScript(strict), React Three Fiber 9 + drei 10 + three 0.184, Tailwind v4, Vitest(신규), @react-three/postprocessing(신규)

**설계 문서:** `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md` — 설계가 바뀌면 코드와 **같은 커밋에서** 이 문서를 갱신한다.

## Global Constraints

- 패키지 매니저는 **pnpm**. `npm`/`yarn` 사용 금지.
- 경로 별칭 `@/*` → 저장소 루트. import는 `@/lib/sim/engine` 형태.
- TypeScript `strict: true`. `any` 금지.
- Canvas 내부 컴포넌트는 파일 최상단에 `'use client'`.
- **천체의 위치·속도·질량은 React state에 넣지 않는다.** 엔진 배열에만 존재한다.
- **`useFrame` 안에서 객체를 새로 할당하지 않는다.** (`new THREE.Vector3()` 등) 모듈 스코프나 ref에 미리 만들어 재사용한다.
- 물리 상수: `G = 1`, 고정 스텝 `1/120`초, 최대 천체 수 `512`.
- 커밋 메시지는 Conventional Commits + 한국어 본문.
- 각 태스크 끝에서 `pnpm check-types`가 통과해야 한다.

## 스펙과의 의도적 차이 (Task 6에서 설계 문서에 반영)

| 스펙 | 계획 | 이유 |
|---|---|---|
| `engine.applyForce(id, vec)` | `engine.applyImpulse(id, dvx, dvy, dvz)` | 힘 누적 버퍼는 1단계에서 아무도 안 쓰는 죽은 코드. 4단계 추력은 `dv = F/m·dt`로 동일하게 표현된다. |
| 파일 목록에 없음 | `lib/sim/scenes.ts` 추가 | 첫 화면이 빈 우주면 곤란하다. 시작용 항성계 1개. 3단계 프리셋의 씨앗이 된다. |
| "엔진을 읽어 그리기만" | `engine.step()`의 **유일한** 호출자는 `Bodies.tsx`의 `useFrame` | R3F에서 `useFrame` priority를 0이 아닌 값으로 주면 자동 렌더링이 꺼지는 함정이 있다. 스텝 순서를 안전하게 보장하려면 단일 소유자가 필요하다. |

---

### Task 1: 정리 + Vitest 도입

기존 시뮬레이션을 걷어내고 물리 테스트를 돌릴 바닥을 깐다.

**Files:**
- Delete: `components/Simulation/Universe.tsx`, `CelestialBody.tsx`, `OrbitPath.tsx`, `SpacetimeGrid.tsx`
- Create: `vitest.config.ts`
- Modify: `package.json` (test 스크립트), `app/page.tsx`, `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: `pnpm test` 명령이 `lib/**/*.test.ts`를 실행한다.

- [ ] **Step 1: Vitest 설치**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: `vitest.config.ts` 생성**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: `package.json`에 test 스크립트 추가**

`"scripts"` 안에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 구 시뮬레이션 삭제**

```bash
git rm -r components/Simulation
```

- [ ] **Step 5: `app/globals.css` 재작성 (네온 사이파이 기반)**

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html,
body {
  height: 100%;
  margin: 0;
  background: #05070d;
  color: #e6ecff;
  font-family: var(--font-sans), system-ui, sans-serif;
  overscroll-behavior: none;
}
```

- [ ] **Step 6: `app/layout.tsx`의 metadata 교체**

```tsx
export const metadata: Metadata = {
  title: "Outer Space Sandbox",
  description: "천체를 던지고 중력으로 뭉치는 것을 구경하는 N-body 샌드박스",
};
```

`<html lang="ko" ...>`로 바꾸고, `<body>`의 className은 `"h-full overflow-hidden"`으로 교체한다.

- [ ] **Step 7: `app/page.tsx` 임시 자리표시자**

```tsx
export default function Home() {
  return <main className="h-full w-full" />;
}
```

- [ ] **Step 8: 검증**

```bash
pnpm check-types && pnpm lint && pnpm test
```

기대: 타입/린트 통과. `pnpm test`는 "No test files found"로 종료(정상, 아직 테스트 없음).

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "chore(sim): 구 시뮬레이션 제거 및 Vitest 도입

1단계 코어 재구축을 위해 components/Simulation을 걷어내고
순수 TS 엔진을 테스트할 Vitest를 추가한다."
```

---

### Task 2: 단위계와 상수 (`lib/sim/units.ts`)

**Files:**
- Create: `lib/sim/units.ts`, `lib/sim/units.test.ts`

**Interfaces:**
- Produces:
  - `G = 1`, `SOFTENING = 0.5`, `MAX_BODIES = 512`, `DENSITY = 1`, `MIN_RADIUS = 0.3`
  - `radiusFromMass(mass: number): number`
  - `BodyType` = `{ NORMAL: 0, BLACK_HOLE: 1, SHIP: 2 }`
  - `BODY_PRESETS: Record<PresetKey, { label: string; mass: number; color: [number, number, number] }>`
  - `type PresetKey = 'asteroid' | 'planet' | 'star'`

- [ ] **Step 1: 실패하는 테스트 작성 — `lib/sim/units.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { radiusFromMass, MIN_RADIUS, BODY_PRESETS } from './units';

describe('radiusFromMass', () => {
  it('질량의 세제곱근에 비례한다 (밀도 일정)', () => {
    const r1 = radiusFromMass(1000);
    const r8 = radiusFromMass(8000);
    expect(r8 / r1).toBeCloseTo(2, 5);
  });

  it('아주 작은 질량도 최소 반지름 아래로는 내려가지 않는다', () => {
    expect(radiusFromMass(1e-9)).toBe(MIN_RADIUS);
  });

  it('프리셋은 소행성 < 행성 < 항성 순으로 무겁다', () => {
    expect(BODY_PRESETS.asteroid.mass).toBeLessThan(BODY_PRESETS.planet.mass);
    expect(BODY_PRESETS.planet.mass).toBeLessThan(BODY_PRESETS.star.mass);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./units"`

- [ ] **Step 3: 구현 — `lib/sim/units.ts`**

```ts
/** 중력 상수. SI 단위는 부동소수점 정밀도만 낭비하므로 G=1인 추상 단위를 쓴다. */
export const G = 1;

/** 중력 소프트닝. 두 천체가 겹칠 때 1/r²이 폭발하는 것을 막는다. */
export const SOFTENING = 0.5;

/** 동시 천체 수 상한. InstancedMesh 인스턴스 수와 같다. */
export const MAX_BODIES = 512;

/** 모든 천체의 밀도는 일정하다고 가정한다. 따라서 r ∝ ∛m. */
export const DENSITY = 1;

/** 화면에서 보이지 않을 만큼 작아지는 것을 막는 하한. */
export const MIN_RADIUS = 0.3;

export const BodyType = {
  NORMAL: 0,
  BLACK_HOLE: 1,
  SHIP: 2,
} as const;

export type PresetKey = 'asteroid' | 'planet' | 'star';

export const BODY_PRESETS: Record<
  PresetKey,
  { label: string; mass: number; color: [number, number, number] }
> = {
  asteroid: { label: '소행성', mass: 0.5, color: [0.55, 0.62, 0.75] },
  planet: { label: '행성', mass: 20, color: [0.25, 0.75, 1.0] },
  star: { label: '항성', mass: 2000, color: [1.0, 0.72, 0.28] },
};

/** 구의 부피 공식을 뒤집는다: m = ρ·(4/3)πr³ */
export function radiusFromMass(mass: number): number {
  const r = Math.cbrt((3 * Math.abs(mass)) / (4 * Math.PI * DENSITY));
  return Math.max(r, MIN_RADIUS);
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 3 passed.

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 단위계와 천체 프리셋 추가

G=1 추상 단위, 밀도 일정 가정에 따른 질량↔반지름 변환,
소행성/행성/항성 프리셋."
```

---

### Task 3: SoA 버퍼 (`lib/sim/bodies.ts`)

천체를 객체 배열이 아니라 병렬 `Float64Array`로 담는다. GC 압력 0, 캐시 효율, O(1) 제거.

**Files:**
- Create: `lib/sim/bodies.ts`, `lib/sim/bodies.test.ts`

**Interfaces:**
- Consumes: `MAX_BODIES`, `BodyType` (Task 2)
- Produces:
  - `interface BodyInit { x, y, z, vx, vy, vz, mass, radius: number; type?: number; color?: [number, number, number] }`
  - `class BodyBuffer` — 필드: `capacity`, `count`, `posX/posY/posZ/velX/velY/velZ/accX/accY/accZ/mass/radius: Float64Array`, `type: Uint8Array`, `id: Int32Array`, `colR/colG/colB: Float32Array`
  - 메서드: `add(b: BodyInit): number`(id 반환, 가득 차면 `-1`), `removeAt(i: number): void`, `removeById(id: number): boolean`, `indexOfId(id: number): number`(없으면 `-1`), `clear(): void`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/bodies.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BodyBuffer, type BodyInit } from './bodies';

const make = (over: Partial<BodyInit> = {}): BodyInit => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1, ...over,
});

describe('BodyBuffer', () => {
  it('추가하면 count가 늘고 서로 다른 id를 준다', () => {
    const b = new BodyBuffer(4);
    const id1 = b.add(make({ x: 1 }));
    const id2 = b.add(make({ x: 2 }));
    expect(b.count).toBe(2);
    expect(id1).not.toBe(id2);
    expect(b.posX[0]).toBe(1);
    expect(b.posX[1]).toBe(2);
  });

  it('용량이 차면 -1을 반환하고 count는 그대로다', () => {
    const b = new BodyBuffer(2);
    b.add(make());
    b.add(make());
    expect(b.add(make())).toBe(-1);
    expect(b.count).toBe(2);
  });

  it('removeAt은 마지막 원소를 빈자리로 옮긴다 (swap-remove)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ x: 10 }));
    b.add(make({ x: 20 }));
    const lastId = b.add(make({ x: 30 }));
    b.removeAt(0);
    expect(b.count).toBe(2);
    expect(b.posX[0]).toBe(30);
    expect(b.id[0]).toBe(lastId);
  });

  it('indexOfId는 swap-remove 후에도 올바른 위치를 찾는다', () => {
    const b = new BodyBuffer(4);
    const a = b.add(make({ x: 10 }));
    const c = b.add(make({ x: 30 }));
    b.removeById(a);
    expect(b.indexOfId(c)).toBe(0);
    expect(b.indexOfId(a)).toBe(-1);
  });

  it('clear는 count를 0으로 되돌린다', () => {
    const b = new BodyBuffer(4);
    b.add(make());
    b.clear();
    expect(b.count).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./bodies"`

- [ ] **Step 3: 구현 — `lib/sim/bodies.ts`**

```ts
import { BodyType, MAX_BODIES } from './units';

export interface BodyInit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
  radius: number;
  type?: number;
  color?: [number, number, number];
}

/**
 * 천체 상태를 SoA(Structure of Arrays)로 담는 고정 크기 버퍼.
 * 버퍼는 생성 시 한 번만 할당되며, 이후 매 프레임 할당이 발생하지 않는다.
 */
export class BodyBuffer {
  readonly capacity: number;
  count = 0;

  readonly posX: Float64Array;
  readonly posY: Float64Array;
  readonly posZ: Float64Array;
  readonly velX: Float64Array;
  readonly velY: Float64Array;
  readonly velZ: Float64Array;
  readonly accX: Float64Array;
  readonly accY: Float64Array;
  readonly accZ: Float64Array;
  readonly mass: Float64Array;
  readonly radius: Float64Array;
  readonly type: Uint8Array;
  readonly id: Int32Array;
  readonly colR: Float32Array;
  readonly colG: Float32Array;
  readonly colB: Float32Array;

  private nextId = 1;

  constructor(capacity: number = MAX_BODIES) {
    this.capacity = capacity;
    const f = () => new Float64Array(capacity);
    this.posX = f();
    this.posY = f();
    this.posZ = f();
    this.velX = f();
    this.velY = f();
    this.velZ = f();
    this.accX = f();
    this.accY = f();
    this.accZ = f();
    this.mass = f();
    this.radius = f();
    this.type = new Uint8Array(capacity);
    this.id = new Int32Array(capacity);
    this.colR = new Float32Array(capacity);
    this.colG = new Float32Array(capacity);
    this.colB = new Float32Array(capacity);
  }

  /** @returns 새 천체의 id. 용량이 가득 찼으면 -1. */
  add(b: BodyInit): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const id = this.nextId++;

    this.posX[i] = b.x;
    this.posY[i] = b.y;
    this.posZ[i] = b.z;
    this.velX[i] = b.vx;
    this.velY[i] = b.vy;
    this.velZ[i] = b.vz;
    this.accX[i] = 0;
    this.accY[i] = 0;
    this.accZ[i] = 0;
    this.mass[i] = b.mass;
    this.radius[i] = b.radius;
    this.type[i] = b.type ?? BodyType.NORMAL;
    this.id[i] = id;

    const [r, g, bl] = b.color ?? [1, 1, 1];
    this.colR[i] = r;
    this.colG[i] = g;
    this.colB[i] = bl;

    return id;
  }

  /** 마지막 원소를 i번 자리로 옮겨 O(1)로 제거한다. 순서는 보존되지 않는다. */
  removeAt(i: number): void {
    const last = this.count - 1;
    if (i < 0 || i > last) return;
    if (i !== last) {
      this.posX[i] = this.posX[last];
      this.posY[i] = this.posY[last];
      this.posZ[i] = this.posZ[last];
      this.velX[i] = this.velX[last];
      this.velY[i] = this.velY[last];
      this.velZ[i] = this.velZ[last];
      this.accX[i] = this.accX[last];
      this.accY[i] = this.accY[last];
      this.accZ[i] = this.accZ[last];
      this.mass[i] = this.mass[last];
      this.radius[i] = this.radius[last];
      this.type[i] = this.type[last];
      this.id[i] = this.id[last];
      this.colR[i] = this.colR[last];
      this.colG[i] = this.colG[last];
      this.colB[i] = this.colB[last];
    }
    this.count = last;
  }

  removeById(id: number): boolean {
    const i = this.indexOfId(id);
    if (i === -1) return false;
    this.removeAt(i);
    return true;
  }

  /** 선형 탐색. count ≤ 512이고 매 프레임 호출되지 않으므로 충분하다. */
  indexOfId(id: number): number {
    for (let i = 0; i < this.count; i++) {
      if (this.id[i] === id) return i;
    }
    return -1;
  }

  clear(): void {
    this.count = 0;
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 8 passed (units 3 + bodies 5).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/bodies.ts lib/sim/bodies.test.ts
git commit -m "feat(sim): SoA 천체 버퍼 추가

Float64Array 병렬 배열로 천체를 담고 swap-remove로 O(1) 제거한다.
매 프레임 할당이 없으므로 GC 압력이 0이다."
```

---

### Task 4: 중력과 립프로그 적분기 (`lib/sim/integrator.ts`)

이 태스크의 원궤도 테스트가 프로젝트 전체에서 가장 중요한 테스트다. 오일러법이면 여기서 반드시 실패한다.

**Files:**
- Create: `lib/sim/integrator.ts`, `lib/sim/integrator.test.ts`

**Interfaces:**
- Consumes: `BodyBuffer` (Task 3), `G`, `SOFTENING` (Task 2)
- Produces:
  - `computeAccelerations(b: BodyBuffer): void` — `accX/accY/accZ`를 채운다
  - `integrate(b: BodyBuffer, dt: number): void` — **호출 시점에 `acc`가 현재 위치에 대해 유효하다고 가정**하고, 종료 시 `acc`를 새 위치 기준으로 갱신해 둔다 (velocity Verlet 불변식)

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/integrator.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { computeAccelerations, integrate } from './integrator';
import { G } from './units';

/** 무거운 중심 천체 + 무시할 만큼 가벼운 위성. 위성은 XZ 평면에서 원궤도를 돈다. */
function circularPair(centralMass: number, r: number) {
  const b = new BodyBuffer(4);
  b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: centralMass, radius: 1 });
  const v = Math.sqrt((G * centralMass) / r);
  b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: v, mass: 1e-6, radius: 0.1 });
  computeAccelerations(b);
  return b;
}

describe('computeAccelerations', () => {
  it('서로를 끌어당긴다 (뉴턴 3법칙: 힘의 크기가 같고 방향이 반대)', () => {
    const b = new BodyBuffer(2);
    b.add({ x: -10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5, radius: 1 });
    b.add({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5, radius: 1 });
    computeAccelerations(b);
    expect(b.accX[0]).toBeGreaterThan(0); // 0번은 +x(상대)를 향해
    expect(b.accX[1]).toBeLessThan(0);    // 1번은 -x를 향해
    // 질량이 같으므로 가속도 크기도 같다
    expect(b.accX[0]).toBeCloseTo(-b.accX[1], 10);
    // 힘 = m·a 의 총합은 0
    const fx = b.mass[0] * b.accX[0] + b.mass[1] * b.accX[1];
    expect(fx).toBeCloseTo(0, 10);
  });

  it('겹친 두 천체에서도 소프트닝 덕분에 유한한 값이 나온다', () => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 1 });
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 1 });
    computeAccelerations(b);
    expect(Number.isFinite(b.accX[0])).toBe(true);
    expect(Number.isFinite(b.accY[0])).toBe(true);
    expect(Number.isFinite(b.accZ[0])).toBe(true);
  });
});

describe('integrate (립프로그)', () => {
  it('원궤도를 100바퀴 돌아도 반지름이 1% 이내로 유지된다', () => {
    const M = 1000;
    const r0 = 100;
    const b = circularPair(M, r0);

    const period = 2 * Math.PI * Math.sqrt((r0 * r0 * r0) / (G * M));
    const dt = 1 / 120;
    const steps = Math.round((100 * period) / dt);

    for (let s = 0; s < steps; s++) integrate(b, dt);

    const r = Math.hypot(b.posX[1] - b.posX[0], b.posY[1] - b.posY[0], b.posZ[1] - b.posZ[0]);
    expect(Math.abs(r - r0) / r0).toBeLessThan(0.01);
  });

  it('중력이 없는 단일 천체는 등속 직선 운동한다', () => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0, mass: 1, radius: 1 });
    computeAccelerations(b);
    for (let s = 0; s < 100; s++) integrate(b, 0.01);
    expect(b.posX[0]).toBeCloseTo(2, 6);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./integrator"`

- [ ] **Step 3: 구현 — `lib/sim/integrator.ts`**

```ts
import type { BodyBuffer } from './bodies';
import { G, SOFTENING } from './units';

/**
 * 모든 쌍의 중력 가속도를 직접 계산한다 (O(N²)).
 * 뉴턴 3법칙 덕분에 쌍마다 한 번만 계산하고 양쪽에 반대로 더한다.
 *
 * 소프트닝: F ∝ 1/(r² + ε²)^1.5
 * r이 0에 가까워질 때 힘이 발산해 천체가 광속으로 튕겨 나가는 것을 막는다.
 */
export function computeAccelerations(b: BodyBuffer): void {
  const n = b.count;
  b.accX.fill(0, 0, n);
  b.accY.fill(0, 0, n);
  b.accZ.fill(0, 0, n);

  const eps2 = SOFTENING * SOFTENING;

  for (let i = 0; i < n; i++) {
    const xi = b.posX[i];
    const yi = b.posY[i];
    const zi = b.posZ[i];
    const mi = b.mass[i];

    for (let j = i + 1; j < n; j++) {
      const dx = b.posX[j] - xi;
      const dy = b.posY[j] - yi;
      const dz = b.posZ[j] - zi;

      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR * invR * invR;
      const s = G * invR3;

      const si = s * b.mass[j]; // i가 j에게 끌리는 가속도 계수
      const sj = s * mi;        // j가 i에게 끌리는 가속도 계수

      b.accX[i] += dx * si;
      b.accY[i] += dy * si;
      b.accZ[i] += dz * si;

      b.accX[j] -= dx * sj;
      b.accY[j] -= dy * sj;
      b.accZ[j] -= dz * sj;
    }
  }
}

/**
 * 립프로그(velocity Verlet) 한 스텝.
 *
 *   v += a·dt/2   (half kick)
 *   x += v·dt     (drift)
 *   a = f(x)      (재계산)
 *   v += a·dt/2   (half kick)
 *
 * 심플렉틱 적분기라 에너지가 장기적으로 유계다. 오일러법은 궤도를 돌수록
 * 에너지가 새어 나가 행성이 나선을 그리며 떨어지거나 튕겨 나간다.
 *
 * 전제: 호출 시 acc가 현재 위치 기준으로 유효해야 한다.
 * 천체를 추가/제거/병합한 뒤에는 반드시 computeAccelerations를 먼저 부를 것.
 */
export function integrate(b: BodyBuffer, dt: number): void {
  const n = b.count;
  const half = dt * 0.5;

  for (let i = 0; i < n; i++) {
    b.velX[i] += b.accX[i] * half;
    b.velY[i] += b.accY[i] * half;
    b.velZ[i] += b.accZ[i] * half;

    b.posX[i] += b.velX[i] * dt;
    b.posY[i] += b.velY[i] * dt;
    b.posZ[i] += b.velZ[i] * dt;
  }

  computeAccelerations(b);

  for (let i = 0; i < n; i++) {
    b.velX[i] += b.accX[i] * half;
    b.velY[i] += b.accY[i] * half;
    b.velZ[i] += b.accZ[i] * half;
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 12 passed. 원궤도 테스트는 240만 스텝을 돌지만 천체가 2개뿐이라 1초 내에 끝난다.

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/integrator.ts lib/sim/integrator.test.ts
git commit -m "feat(sim): 소프트닝 중력과 립프로그 적분기 추가

심플렉틱 적분기라 원궤도 100바퀴 후에도 반지름이 1% 이내로 유지된다.
3단계의 '안정된 태양계'가 이 성질에 의존한다."
```

---

### Task 5: 병합 충돌 (`lib/sim/collisions.ts`)

**Files:**
- Create: `lib/sim/collisions.ts`, `lib/sim/collisions.test.ts`

**Interfaces:**
- Consumes: `BodyBuffer` (Task 3)
- Produces: `resolveCollisions(b: BodyBuffer): boolean` — 병합이 하나라도 일어났으면 `true`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/collisions.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { resolveCollisions } from './collisions';

describe('resolveCollisions', () => {
  it('겹치지 않으면 아무 일도 일어나지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: -10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1 });
    b.add({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1 });
    expect(resolveCollisions(b)).toBe(false);
    expect(b.count).toBe(2);
  });

  it('질량과 운동량을 보존하며 하나로 합친다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 4, vy: 0, vz: 0, mass: 3, radius: 2 });
    b.add({ x: 1, y: 0, z: 0, vx: -2, vy: 0, vz: 0, mass: 1, radius: 2 });

    const pxBefore = 3 * 4 + 1 * -2; // 10
    expect(resolveCollisions(b)).toBe(true);

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeCloseTo(4, 10);
    expect(b.mass[0] * b.velX[0]).toBeCloseTo(pxBefore, 10);
    expect(b.velX[0]).toBeCloseTo(2.5, 10);
  });

  it('반지름은 부피 보존으로 합쳐진다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 3 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 4 });
    resolveCollisions(b);
    expect(b.radius[0]).toBeCloseTo(Math.cbrt(27 + 64), 10);
  });

  it('같은 질량이 반대 속도로 정면충돌하면 정지한 하나가 된다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: -0.5, y: 0, z: 0, vx: 5, vy: 0, vz: 0, mass: 10, radius: 1 });
    b.add({ x: 0.5, y: 0, z: 0, vx: -5, vy: 0, vz: 0, mass: 10, radius: 1 });
    resolveCollisions(b);
    expect(b.count).toBe(1);
    expect(b.velX[0]).toBeCloseTo(0, 10);
    expect(b.mass[0]).toBeCloseTo(20, 10);
  });

  it('무거운 쪽의 id와 색을 물려받는다', () => {
    const b = new BodyBuffer(4);
    const smallId = b.add({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2,
      color: [1, 0, 0],
    });
    const bigId = b.add({
      x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 2,
      color: [0, 0, 1],
    });
    resolveCollisions(b);
    expect(b.id[0]).toBe(bigId);
    expect(b.id[0]).not.toBe(smallId);
    expect(b.colB[0]).toBeCloseTo(1, 5);
  });

  it('세 천체가 한 덩어리로 겹쳐 있으면 하나로 합쳐진다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    b.add({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    resolveCollisions(b);
    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeCloseTo(3, 10);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./collisions"`

- [ ] **Step 3: 구현 — `lib/sim/collisions.ts`**

```ts
import type { BodyBuffer } from './bodies';

/**
 * j번 천체를 i번 천체에 흡수시킨다. 보존량:
 *   질량   m = m₁ + m₂
 *   운동량 v = (m₁v₁ + m₂v₂) / m
 *   부피   r = ∛(r₁³ + r₂³)
 * 정체성(id·색·타입)은 더 무거운 쪽을 물려받는다.
 */
function mergeInto(b: BodyBuffer, i: number, j: number): void {
  const m1 = b.mass[i];
  const m2 = b.mass[j];
  const m = m1 + m2;
  const inv = 1 / m;

  const vx = (m1 * b.velX[i] + m2 * b.velX[j]) * inv;
  const vy = (m1 * b.velY[i] + m2 * b.velY[j]) * inv;
  const vz = (m1 * b.velZ[i] + m2 * b.velZ[j]) * inv;

  const px = (m1 * b.posX[i] + m2 * b.posX[j]) * inv;
  const py = (m1 * b.posY[i] + m2 * b.posY[j]) * inv;
  const pz = (m1 * b.posZ[i] + m2 * b.posZ[j]) * inv;

  const r1 = b.radius[i];
  const r2 = b.radius[j];
  const radius = Math.cbrt(r1 * r1 * r1 + r2 * r2 * r2);

  if (m2 > m1) {
    b.id[i] = b.id[j];
    b.type[i] = b.type[j];
    b.colR[i] = b.colR[j];
    b.colG[i] = b.colG[j];
    b.colB[i] = b.colB[j];
  }

  b.mass[i] = m;
  b.radius[i] = radius;
  b.posX[i] = px;
  b.posY[i] = py;
  b.posZ[i] = pz;
  b.velX[i] = vx;
  b.velY[i] = vy;
  b.velZ[i] = vz;
}

/**
 * 거리 < 반지름 합인 쌍을 모두 병합한다.
 * @returns 병합이 한 번이라도 일어났으면 true (호출자는 가속도를 다시 계산해야 한다)
 */
export function resolveCollisions(b: BodyBuffer): boolean {
  let merged = false;

  for (let i = 0; i < b.count; i++) {
    let j = i + 1;
    while (j < b.count) {
      const dx = b.posX[j] - b.posX[i];
      const dy = b.posY[j] - b.posY[i];
      const dz = b.posZ[j] - b.posZ[i];
      const rsum = b.radius[i] + b.radius[j];

      if (dx * dx + dy * dy + dz * dz < rsum * rsum) {
        mergeInto(b, i, j);
        b.removeAt(j); // 마지막 원소가 j 자리로 온다 → j를 증가시키지 않고 다시 검사
        merged = true;
      } else {
        j++;
      }
    }
  }

  return merged;
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 18 passed.

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/collisions.ts lib/sim/collisions.test.ts
git commit -m "feat(sim): 병합 충돌 추가

질량·운동량·부피를 보존하며 두 천체를 합친다.
정체성은 무거운 쪽을 물려받는다."
```

---

### Task 6: 엔진 (`lib/sim/engine.ts`) + 설계 문서 갱신

시간 누적기, 배속, NaN 격리, 그리고 2~4단계용 확장 API.

**Files:**
- Create: `lib/sim/engine.ts`, `lib/sim/engine.test.ts`
- Modify: `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md` (§10 확장 지점, §9 파일 구조)

**Interfaces:**
- Consumes: `BodyBuffer`, `computeAccelerations`, `integrate`, `resolveCollisions`, `radiusFromMass`, `MAX_BODIES`
- Produces:
  - 상수: `FIXED_DT = 1/120`, `MAX_FRAME_DT = 0.05`, `MAX_SUBSTEPS = 32`
  - `interface SpawnOptions { position: [number, number, number]; velocity: [number, number, number]; mass: number; type?: number; color?: [number, number, number] }`
  - `interface SerializedState { simTime: number; bodies: SerializedBody[] }`
  - `class SimulationEngine` — 필드 `bodies: BodyBuffer`, `timeScale: number`, `paused: boolean`, `simTime: number`
  - 메서드: `spawn(o: SpawnOptions): number`, `remove(id: number): boolean`, `setMass(id: number, mass: number): void`, `applyImpulse(id: number, dvx: number, dvy: number, dvz: number): void`, `step(realDt: number): void`, `reset(): void`, `serialize(): SerializedState`, `load(s: SerializedState): void`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/engine.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine, FIXED_DT, MAX_SUBSTEPS } from './engine';
import { MAX_BODIES, radiusFromMass } from './units';

const spawn = (e: SimulationEngine, x: number, mass = 10) =>
  e.spawn({ position: [x, 0, 0], velocity: [0, 0, 0], mass });

describe('SimulationEngine', () => {
  it('일시정지 상태에서는 시간이 흐르지 않는다', () => {
    const e = new SimulationEngine();
    spawn(e, 0);
    e.paused = true;
    e.step(1);
    expect(e.simTime).toBe(0);
  });

  it('배속을 올리면 같은 실시간에 더 많은 시뮬레이션 시간이 흐른다', () => {
    const a = new SimulationEngine();
    const b = new SimulationEngine();
    a.step(0.1);
    b.timeScale = 4;
    b.step(0.1);
    expect(b.simTime).toBeGreaterThan(a.simTime * 3.5);
  });

  it('프레임 dt가 튀어도 서브스텝 상한을 넘지 않는다 (죽음의 나선 방지)', () => {
    const e = new SimulationEngine();
    e.step(10); // 탭 복귀 등으로 dt가 10초 튄 상황
    expect(e.simTime).toBeLessThanOrEqual(MAX_SUBSTEPS * FIXED_DT + 1e-9);
  });

  it('용량이 가득 차면 spawn이 -1을 반환한다', () => {
    const e = new SimulationEngine();
    for (let i = 0; i < MAX_BODIES; i++) spawn(e, i * 100);
    expect(spawn(e, 999)).toBe(-1);
    expect(e.bodies.count).toBe(MAX_BODIES);
  });

  it('setMass는 반지름도 함께 갱신한다', () => {
    const e = new SimulationEngine();
    const id = spawn(e, 0, 10);
    e.setMass(id, 8000);
    const i = e.bodies.indexOfId(id);
    expect(e.bodies.mass[i]).toBe(8000);
    expect(e.bodies.radius[i]).toBeCloseTo(radiusFromMass(8000), 10);
  });

  it('applyImpulse는 속도를 바꾼다', () => {
    const e = new SimulationEngine();
    const id = spawn(e, 0);
    e.applyImpulse(id, 3, 0, 0);
    expect(e.bodies.velX[e.bodies.indexOfId(id)]).toBeCloseTo(3, 10);
  });

  it('같은 입력에 같은 결과를 낸다 (결정론)', () => {
    const build = () => {
      const e = new SimulationEngine();
      e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 1000 });
      e.spawn({ position: [80, 0, 0], velocity: [0, 0, 3.5], mass: 5 });
      e.spawn({ position: [-60, 0, 20], velocity: [0.5, 0, -3], mass: 5 });
      return e;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 300; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.bodies.count).toBe(b.bodies.count);
    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posX[i]).toBe(b.bodies.posX[i]);
      expect(a.bodies.posZ[i]).toBe(b.bodies.posZ[i]);
    }
  });

  it('오염된 천체(NaN)를 제거하고 다른 천체로 전염시키지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = new SimulationEngine();
    const healthy = e.spawn({ position: [500, 0, 0], velocity: [0, 0, 0], mass: 1 });
    const sick = spawn(e, 0);

    e.bodies.velX[e.bodies.indexOfId(sick)] = Number.NaN;
    e.step(1 / 60);

    expect(e.bodies.indexOfId(sick)).toBe(-1);
    const h = e.bodies.indexOfId(healthy);
    expect(h).not.toBe(-1);
    expect(Number.isFinite(e.bodies.posX[h])).toBe(true);
    warn.mockRestore();
  });

  it('serialize → load 왕복이 상태를 보존한다', () => {
    const e = new SimulationEngine();
    e.spawn({ position: [1, 2, 3], velocity: [4, 5, 6], mass: 7, color: [0.1, 0.2, 0.3] });
    e.step(1 / 60);
    const snapshot = e.serialize();

    const e2 = new SimulationEngine();
    e2.load(snapshot);

    expect(e2.bodies.count).toBe(e.bodies.count);
    expect(e2.simTime).toBe(e.simTime);
    expect(e2.bodies.posX[0]).toBe(e.bodies.posX[0]);
    expect(e2.bodies.mass[0]).toBe(e.bodies.mass[0]);
  });

  it('reset은 모든 천체와 시간을 지운다', () => {
    const e = new SimulationEngine();
    spawn(e, 0);
    e.step(1 / 60);
    e.reset();
    expect(e.bodies.count).toBe(0);
    expect(e.simTime).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./engine"`

- [ ] **Step 3: 구현 — `lib/sim/engine.ts`**

```ts
import { BodyBuffer, type BodyInit } from './bodies';
import { resolveCollisions } from './collisions';
import { computeAccelerations, integrate } from './integrator';
import { BodyType, MAX_BODIES, radiusFromMass } from './units';

/** 물리 스텝은 화면 프레임과 무관하게 항상 이 간격으로 돈다. */
export const FIXED_DT = 1 / 120;

/** 탭 복귀 등으로 dt가 튈 때 잘라내는 상한. 이걸 안 하면 시뮬레이션이 폭발한다. */
export const MAX_FRAME_DT = 0.05;

/** 프레임당 물리 스텝 상한. 초과분은 버린다(죽음의 나선 방지). */
export const MAX_SUBSTEPS = 32;

export interface SpawnOptions {
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  type?: number;
  color?: [number, number, number];
}

export interface SerializedBody extends BodyInit {
  id: number;
}

export interface SerializedState {
  simTime: number;
  bodies: SerializedBody[];
}

export class SimulationEngine {
  readonly bodies: BodyBuffer;

  timeScale = 1;
  paused = false;
  simTime = 0;

  private accumulator = 0;
  /** 천체가 추가·제거·병합되면 가속도가 낡는다. 다음 스텝 전에 다시 계산해야 한다. */
  private accDirty = true;

  constructor(capacity: number = MAX_BODIES) {
    this.bodies = new BodyBuffer(capacity);
  }

  /** @returns 새 천체의 id. 용량이 가득 찼으면 -1. */
  spawn(o: SpawnOptions): number {
    const id = this.bodies.add({
      x: o.position[0],
      y: o.position[1],
      z: o.position[2],
      vx: o.velocity[0],
      vy: o.velocity[1],
      vz: o.velocity[2],
      mass: o.mass,
      radius: radiusFromMass(o.mass),
      type: o.type ?? BodyType.NORMAL,
      color: o.color,
    });
    if (id !== -1) this.accDirty = true;
    return id;
  }

  remove(id: number): boolean {
    const removed = this.bodies.removeById(id);
    if (removed) this.accDirty = true;
    return removed;
  }

  /** 2단계(신의 손)용. 질량을 바꾸면 반지름도 따라 바뀐다. */
  setMass(id: number, mass: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    this.bodies.mass[i] = mass;
    this.bodies.radius[i] = radiusFromMass(mass);
    this.accDirty = true;
  }

  /** 4단계(우주선 추력)용. 추력 F를 dt 동안 준 효과는 dv = F/m·dt 다. */
  applyImpulse(id: number, dvx: number, dvy: number, dvz: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    this.bodies.velX[i] += dvx;
    this.bodies.velY[i] += dvy;
    this.bodies.velZ[i] += dvz;
  }

  /**
   * 실시간 dt를 받아 고정 스텝 물리를 필요한 횟수만큼 돌린다.
   * 배속은 누적기에 곱해진다.
   */
  step(realDt: number): void {
    if (this.paused) return;

    this.accumulator += Math.min(realDt, MAX_FRAME_DT) * this.timeScale;

    let n = 0;
    while (this.accumulator >= FIXED_DT && n < MAX_SUBSTEPS) {
      this.substep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      n++;
    }

    // 상한에 걸렸다면 밀린 시간은 버린다. 그대로 쌓으면 다음 프레임이 더 느려지고
    // 그게 다시 백로그를 키우는 죽음의 나선이 된다. 시뮬레이션이 느려질 뿐 폭발하지 않는다.
    if (n === MAX_SUBSTEPS) this.accumulator = 0;
  }

  private substep(dt: number): void {
    if (this.accDirty) {
      computeAccelerations(this.bodies);
      this.accDirty = false;
    }

    integrate(this.bodies, dt);

    if (resolveCollisions(this.bodies)) this.accDirty = true;
    this.sanitize();

    this.simTime += dt;
  }

  /**
   * NaN/Infinity로 오염된 천체를 제거한다.
   * 하나의 NaN이 다음 프레임에 모든 천체로 전염되는 것이 N-body의 전형적인 죽음이다.
   */
  private sanitize(): void {
    const b = this.bodies;
    for (let i = b.count - 1; i >= 0; i--) {
      const ok =
        Number.isFinite(b.posX[i]) &&
        Number.isFinite(b.posY[i]) &&
        Number.isFinite(b.posZ[i]) &&
        Number.isFinite(b.velX[i]) &&
        Number.isFinite(b.velY[i]) &&
        Number.isFinite(b.velZ[i]) &&
        Number.isFinite(b.mass[i]);

      if (!ok) {
        console.warn(`[sim] 오염된 천체 제거 (id=${b.id[i]})`);
        b.removeAt(i);
        this.accDirty = true;
      }
    }
  }

  reset(): void {
    this.bodies.clear();
    this.simTime = 0;
    this.accumulator = 0;
    this.accDirty = true;
  }

  serialize(): SerializedState {
    const b = this.bodies;
    const bodies: SerializedBody[] = [];
    for (let i = 0; i < b.count; i++) {
      bodies.push({
        id: b.id[i],
        x: b.posX[i],
        y: b.posY[i],
        z: b.posZ[i],
        vx: b.velX[i],
        vy: b.velY[i],
        vz: b.velZ[i],
        mass: b.mass[i],
        radius: b.radius[i],
        type: b.type[i],
        color: [b.colR[i], b.colG[i], b.colB[i]],
      });
    }
    return { simTime: this.simTime, bodies };
  }

  load(state: SerializedState): void {
    this.reset();
    for (const body of state.bodies) this.bodies.add(body);
    this.simTime = state.simTime;
    this.accDirty = true;
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 28 passed.

- [ ] **Step 5: 설계 문서 갱신**

`docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`의 §10 코드 블록에서 `engine.applyForce(id, vec)` 줄을 아래로 교체한다.

```ts
engine.applyImpulse(id, dvx, dvy, dvz)   // 4단계: 우주선 추력 (dv = F/m·dt)
```

그 코드 블록 바로 아래에 다음 문단을 추가한다.

> **2026-07-14 변경:** `applyForce`를 `applyImpulse`로 바꿨다. 힘을 받으려면 프레임 사이에 힘을 누적할 버퍼가 필요한데, 1단계에서는 아무도 쓰지 않아 죽은 코드가 된다. 추력은 `dv = F/m·dt`로 임펄스와 동등하게 표현되므로 4단계 능력에는 손실이 없다.

§9 파일 구조의 `lib/sim/` 목록에 다음 줄을 추가한다.

```
  scenes.ts         시작용 항성계 (3단계 프리셋의 씨앗)
```

- [ ] **Step 6: 커밋**

```bash
git add lib/sim/engine.ts lib/sim/engine.test.ts docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md
git commit -m "feat(sim): 시뮬레이션 엔진 추가

고정 스텝 누적기, 배속, 서브스텝 상한, NaN 격리, 직렬화.
확장 지점 applyForce를 applyImpulse로 변경하고 설계 문서에 반영."
```

---

### Task 7: 궤적 미리보기 (`lib/sim/predict.ts`) + 시작 씬 (`lib/sim/scenes.ts`)

미리보기가 이 단계 재미의 절반을 책임진다. 현재 천체들의 중력장을 **고정**한 채 새 천체 하나만 굴려 본다.

**Files:**
- Create: `lib/sim/predict.ts`, `lib/sim/predict.test.ts`, `lib/sim/scenes.ts`

**Interfaces:**
- Consumes: `BodyBuffer`, `G`, `SOFTENING`, `SimulationEngine`, `BODY_PRESETS`
- Produces:
  - `predictTrajectory(bodies: BodyBuffer, start: [number, number, number], vel: [number, number, number], out: Float32Array, dt?: number): number` — `out`에 xyz를 채우고 **채운 점의 개수**를 반환. 기존 천체와 충돌하면 그 지점에서 멈춘다.
  - `createStarterSystem(engine: SimulationEngine): void`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/predict.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { predictTrajectory } from './predict';
import { G } from './units';

describe('predictTrajectory', () => {
  it('원궤도 속도로 쏘면 예측 궤적이 원을 그린다', () => {
    const b = new BodyBuffer(4);
    const M = 1000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: M, radius: 2 });

    const r = 100;
    const v = Math.sqrt((G * M) / r);
    const out = new Float32Array(400 * 3);
    const n = predictTrajectory(b, [r, 0, 0], [0, 0, v], out, 1 / 60);

    expect(n).toBe(400);
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(Math.abs(d - r) / r).toBeLessThan(0.02);
    }
  });

  it('천체에 충돌하면 궤적이 거기서 끊긴다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 10 });

    const out = new Float32Array(400 * 3);
    // 정지 상태로 놓으면 곧바로 중심 천체로 떨어진다
    const n = predictTrajectory(b, [40, 0, 0], [0, 0, 0], out, 1 / 60);

    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(400);
  });

  it('중력원이 없으면 직선이다', () => {
    const b = new BodyBuffer(4);
    const out = new Float32Array(10 * 3);
    const n = predictTrajectory(b, [0, 0, 0], [1, 0, 0], out, 1);

    expect(n).toBe(10);
    expect(out[0]).toBeCloseTo(1, 5);   // 1스텝 뒤 x=1
    expect(out[3 * 3]).toBeCloseTo(4, 5); // 4스텝 뒤 x=4
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

기대: FAIL — `Failed to resolve import "./predict"`

- [ ] **Step 3: 구현 — `lib/sim/predict.ts`**

```ts
import type { BodyBuffer } from './bodies';
import { G, SOFTENING } from './units';

/**
 * 던지려는 천체 하나가 그릴 궤적을 미리 계산한다.
 *
 * 기존 천체들은 **정지해 있다고 가정**한다(중력장 고정). 짧은 예측 구간에서는
 * 충분히 정확하고, N번의 O(N²)가 아니라 O(steps·N)이라 드래그 중에도 공짜에 가깝다.
 * 탐침의 질량은 기존 천체에 영향을 주지 않으므로 필요 없다.
 *
 * @param out 미리 할당된 버퍼. 길이/3 만큼의 점을 채운다. (useFrame 중 할당 금지)
 * @returns 실제로 채운 점의 개수. 충돌하면 그 지점에서 멈춘다.
 */
export function predictTrajectory(
  bodies: BodyBuffer,
  start: [number, number, number],
  vel: [number, number, number],
  out: Float32Array,
  dt = 1 / 60,
): number {
  const maxPoints = Math.floor(out.length / 3);
  const eps2 = SOFTENING * SOFTENING;
  const n = bodies.count;

  let px = start[0];
  let py = start[1];
  let pz = start[2];
  let vx = vel[0];
  let vy = vel[1];
  let vz = vel[2];

  for (let s = 0; s < maxPoints; s++) {
    let ax = 0;
    let ay = 0;
    let az = 0;

    for (let i = 0; i < n; i++) {
      const dx = bodies.posX[i] - px;
      const dy = bodies.posY[i] - py;
      const dz = bodies.posZ[i] - pz;

      const dist2 = dx * dx + dy * dy + dz * dz;

      // 기존 천체 표면에 닿으면 궤적을 끊는다
      if (dist2 < bodies.radius[i] * bodies.radius[i]) return s;

      const r2 = dist2 + eps2;
      const invR = 1 / Math.sqrt(r2);
      const f = G * bodies.mass[i] * invR * invR * invR;

      ax += dx * f;
      ay += dy * f;
      az += dz * f;
    }

    // 세미-임플리시트 오일러. 예측 구간이 짧아 이 정도면 충분하다.
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    out[s * 3] = px;
    out[s * 3 + 1] = py;
    out[s * 3 + 2] = pz;
  }

  return maxPoints;
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

기대: 31 passed.

- [ ] **Step 5: 시작 씬 구현 — `lib/sim/scenes.ts`**

```ts
import type { SimulationEngine } from './engine';
import { BODY_PRESETS, G } from './units';

/** 중심 질량 M 주위 반지름 r에서 XZ 평면 원궤도를 도는 속도 */
function circularVelocity(M: number, r: number): [number, number, number] {
  const v = Math.sqrt((G * M) / r);
  return [0, 0, v];
}

/**
 * 첫 화면이 텅 빈 우주면 곤란하다. 항성 하나 + 행성 셋 + 소행성 띠.
 * 3단계 시나리오 프리셋은 이 함수를 확장한 형태가 된다.
 */
export function createStarterSystem(engine: SimulationEngine): void {
  engine.reset();

  const starMass = BODY_PRESETS.star.mass;
  engine.spawn({
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: starMass,
    color: BODY_PRESETS.star.color,
  });

  const planetRadii = [60, 100, 155];
  for (const r of planetRadii) {
    engine.spawn({
      position: [r, 0, 0],
      velocity: circularVelocity(starMass, r),
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }

  // 소행성 띠: 반지름 200~230에 60개를 고르게 뿌린다
  const count = 60;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 200 + (i % 7) * 5;
    const v = Math.sqrt((G * starMass) / r);
    engine.spawn({
      position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
      velocity: [-Math.sin(angle) * v, 0, Math.cos(angle) * v],
      mass: BODY_PRESETS.asteroid.mass,
      color: BODY_PRESETS.asteroid.color,
    });
  }
}
```

- [ ] **Step 6: 검증**

```bash
pnpm test && pnpm check-types
```

기대: 31 passed, 타입 통과.

- [ ] **Step 7: 커밋**

```bash
git add lib/sim/predict.ts lib/sim/predict.test.ts lib/sim/scenes.ts
git commit -m "feat(sim): 궤적 미리보기와 시작 항성계 추가

중력장을 고정한 채 탐침 하나만 굴려 O(steps·N)으로 궤적을 예측한다.
출력 버퍼를 받아 드래그 중 할당이 발생하지 않는다."
```

---

### Task 8: React 경계 (`state/SimulationProvider.tsx`)

엔진 인스턴스와 UI state의 소유자. **여기가 물리와 React가 만나는 유일한 지점이다.**

**Files:**
- Create: `state/SimulationProvider.tsx`

**Interfaces:**
- Consumes: `SimulationEngine`, `createStarterSystem`, `BODY_PRESETS`, `PresetKey`
- Produces:
  - `<SimulationProvider>` — 클라이언트 컴포넌트
  - `useSimulation(): SimulationContextValue`
  - ```ts
    interface SimStats { count: number; simTime: number; fps: number }
    interface SimulationContextValue {
      engine: SimulationEngine;
      bodiesMeshRef: RefObject<THREE.InstancedMesh | null>;
      paused: boolean; setPaused: (v: boolean) => void;
      timeScale: number; setTimeScale: (v: number) => void;
      spawnMass: number; setSpawnMass: (v: number) => void;
      preset: PresetKey; setPreset: (v: PresetKey) => void;
      showTrails: boolean; setShowTrails: (v: boolean) => void;
      selectedId: number | null; setSelectedId: (v: number | null) => void;
      stats: SimStats; setStats: (s: SimStats) => void;
      resetScene: () => void;
    }
    ```

- [ ] **Step 1: 구현 — `state/SimulationProvider.tsx`**

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type * as THREE from 'three';
import { SimulationEngine } from '@/lib/sim/engine';
import { createStarterSystem } from '@/lib/sim/scenes';
import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';

export interface SimStats {
  count: number;
  simTime: number;
  fps: number;
}

export interface SimulationContextValue {
  engine: SimulationEngine;
  bodiesMeshRef: RefObject<THREE.InstancedMesh | null>;
  paused: boolean;
  setPaused: (v: boolean) => void;
  timeScale: number;
  setTimeScale: (v: number) => void;
  spawnMass: number;
  setSpawnMass: (v: number) => void;
  preset: PresetKey;
  setPreset: (v: PresetKey) => void;
  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  selectedId: number | null;
  setSelectedId: (v: number | null) => void;
  stats: SimStats;
  setStats: (s: SimStats) => void;
  resetScene: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation은 SimulationProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  // 엔진은 단 한 번만 만들어지고 이후 identity가 바뀌지 않는다.
  const [engine] = useState(() => new SimulationEngine());
  const bodiesMeshRef = useRef<THREE.InstancedMesh | null>(null);

  const [paused, setPausedState] = useState(false);
  const [timeScale, setTimeScaleState] = useState(1);
  const [preset, setPresetState] = useState<PresetKey>('planet');
  const [spawnMass, setSpawnMass] = useState(BODY_PRESETS.planet.mass);
  const [showTrails, setShowTrails] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stats, setStats] = useState<SimStats>({ count: 0, simTime: 0, fps: 0 });

  useEffect(() => {
    createStarterSystem(engine);
  }, [engine]);

  // UI → 엔진은 명령형 호출로만. 엔진은 React를 다시 그리게 만들지 않는다.
  const setPaused = useCallback(
    (v: boolean) => {
      engine.paused = v;
      setPausedState(v);
    },
    [engine],
  );

  const setTimeScale = useCallback(
    (v: number) => {
      engine.timeScale = v;
      setTimeScaleState(v);
    },
    [engine],
  );

  const setPreset = useCallback((v: PresetKey) => {
    setPresetState(v);
    setSpawnMass(BODY_PRESETS[v].mass);
  }, []);

  const resetScene = useCallback(() => {
    createStarterSystem(engine);
    setSelectedId(null);
  }, [engine]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      engine,
      bodiesMeshRef,
      paused,
      setPaused,
      timeScale,
      setTimeScale,
      spawnMass,
      setSpawnMass,
      preset,
      setPreset,
      showTrails,
      setShowTrails,
      selectedId,
      setSelectedId,
      stats,
      setStats,
      resetScene,
    }),
    [
      engine, paused, setPaused, timeScale, setTimeScale, spawnMass,
      preset, setPreset, showTrails, selectedId, stats, resetScene,
    ],
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}
```

- [ ] **Step 2: 검증**

```bash
pnpm check-types && pnpm lint
```

기대: 통과.

- [ ] **Step 3: 커밋**

```bash
git add state/SimulationProvider.tsx
git commit -m "feat(state): 시뮬레이션 Context 추가

엔진 인스턴스와 UI state의 유일한 소유자.
천체 상태는 여기 들어오지 않고 엔진 배열에만 존재한다."
```

---

### Task 9: 화면에 띄우기 — Canvas + 별 + 천체

이 태스크가 끝나면 **처음으로 우주가 보인다.** 시작 항성계가 실제로 공전해야 한다.

**Files:**
- Create: `components/scene/SpaceCanvas.tsx`, `components/scene/Starfield.tsx`, `components/scene/Bodies.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useSimulation` (Task 8), `MAX_BODIES` (Task 2)
- Produces: `<SpaceCanvas>` — Canvas 경계. `<Bodies>`가 `engine.step()`의 **유일한** 호출자.

- [ ] **Step 1: `components/scene/Bodies.tsx`**

```tsx
'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useSimulation } from '@/state/SimulationProvider';
import { MAX_BODIES } from '@/lib/sim/units';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

const STATS_INTERVAL = 0.1; // 10Hz

export default function Bodies() {
  const { engine, bodiesMeshRef, setStats } = useSimulation();
  const statsTimer = useRef(0);
  const fpsEma = useRef(60);

  useFrame((_, delta) => {
    // 엔진 stepping의 유일한 주인. 다른 컴포넌트는 읽기만 한다.
    engine.step(delta);

    const mesh = bodiesMeshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    mesh.count = b.count;

    for (let i = 0; i < b.count; i++) {
      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.scale.setScalar(b.radius[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.setRGB(b.colR[i], b.colG[i], b.colB[i]);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // 표시용 수치는 매 프레임이 아니라 10Hz로만 React에 밀어 올린다.
    const instFps = delta > 0 ? 1 / delta : 0;
    fpsEma.current = fpsEma.current * 0.9 + instFps * 0.1;

    statsTimer.current += delta;
    if (statsTimer.current >= STATS_INTERVAL) {
      statsTimer.current = 0;
      setStats({
        count: b.count,
        simTime: engine.simTime,
        fps: Math.round(fpsEma.current),
      });
    }
  });

  return (
    <instancedMesh
      ref={bodiesMeshRef}
      args={[undefined, undefined, MAX_BODIES]}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 3]} />
      {/* 발광체처럼 보이도록 조명 계산 없이 원색을 그대로 낸다. 블룸이 나머지를 한다. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
```

- [ ] **Step 2: `components/scene/Starfield.tsx`**

```tsx
'use client';

import { Stars } from '@react-three/drei';

export default function Starfield() {
  return (
    <Stars radius={900} depth={120} count={4000} factor={5} saturation={0} fade speed={0} />
  );
}
```

- [ ] **Step 3: `components/scene/SpaceCanvas.tsx`**

```tsx
'use client';

import { Canvas } from '@react-three/fiber';
import Bodies from './Bodies';
import Starfield from './Starfield';

export default function SpaceCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 140, 260], fov: 55, near: 0.1, far: 5000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#05070d']} />
      <Starfield />
      {/* Bodies가 engine.step()의 유일한 호출자이므로 다른 씬 요소보다 먼저 마운트한다. */}
      <Bodies />
    </Canvas>
  );
}
```

- [ ] **Step 4: `app/page.tsx`**

```tsx
import SpaceCanvas from '@/components/scene/SpaceCanvas';
import { SimulationProvider } from '@/state/SimulationProvider';

export default function Home() {
  return (
    <SimulationProvider>
      <main className="relative h-dvh w-dvw overflow-hidden">
        <SpaceCanvas />
      </main>
    </SimulationProvider>
  );
}
```

- [ ] **Step 5: 검증 — 실제로 눈으로 본다**

```bash
pnpm check-types && pnpm lint && pnpm dev
```

브라우저에서 `http://localhost:3000`을 연다. 확인할 것:
- 별 배경 위에 주황색 항성 1개, 파란 행성 3개, 회색 소행성 띠가 보인다.
- 행성과 소행성이 **항성 주위를 공전한다** (정지해 있으면 `engine.step` 또는 `createStarterSystem`이 안 돈 것이다).
- 콘솔에 에러가 없다.

- [ ] **Step 6: 커밋**

```bash
git add components/scene app/page.tsx
git commit -m "feat(scene): Canvas 경계와 InstancedMesh 천체 렌더 추가

512개 천체를 draw call 1회로 그린다. 천체 상태는 React를 거치지 않고
엔진 배열에서 인스턴스 행렬로 직접 흐른다."
```

---

### Task 10: 카메라 (`components/scene/CameraRig.tsx`)

왼쪽 버튼을 던지기에 내주기 위해 OrbitControls의 버튼 매핑을 바꾼다.

**Files:**
- Create: `components/scene/CameraRig.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation` (선택된 천체 추적)
- Produces: `<CameraRig>` — 우클릭 회전 / 휠 줌 / 가운데 팬, 선택된 천체를 카메라 타깃으로 따라간다.

- [ ] **Step 1: `components/scene/CameraRig.tsx`**

```tsx
'use client';

import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSimulation } from '@/state/SimulationProvider';

const target = new THREE.Vector3();

export default function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { engine, selectedId } = useSimulation();

  useFrame(() => {
    if (selectedId === null || !controls.current) return;

    const b = engine.bodies;
    const i = b.indexOfId(selectedId);
    if (i === -1) return;

    // 선택된 천체를 부드럽게 따라간다.
    target.set(b.posX[i], b.posY[i], b.posZ[i]);
    controls.current.target.lerp(target, 0.1);
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={2000}
      // 왼쪽 버튼은 던지기가 쓴다. LEFT를 비워두면 OrbitControls가 무시한다.
      mouseButtons={{
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
    />
  );
}
```

- [ ] **Step 2: `SpaceCanvas.tsx`에 CameraRig 추가**

`<Bodies />` 아래에 `<CameraRig />`를 추가하고 import 한다.

- [ ] **Step 3: 검증**

```bash
pnpm check-types && pnpm lint && pnpm dev
```

브라우저에서 확인:
- **오른쪽 드래그**로 카메라가 회전한다.
- **휠**로 줌인/줌아웃된다.
- **왼쪽 드래그**로는 카메라가 움직이지 **않는다** (이게 핵심이다).

> `three-stdlib` 타입이 없다는 오류가 나면 `import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'` 대신 `React.ComponentRef<typeof OrbitControls>`를 쓴다. drei가 `three-stdlib`를 의존성으로 갖고 있으므로 보통은 그대로 해결된다.

- [ ] **Step 4: 커밋**

```bash
git add components/scene/CameraRig.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 카메라 리그 추가

우클릭 회전/휠 줌/가운데 팬. 왼쪽 버튼은 던지기에 내준다.
선택된 천체가 있으면 카메라 타깃이 그것을 따라간다."
```

---

### Task 11: 던지기와 선택 (`components/scene/SpawnController.tsx`)

포인터 입력의 **유일한 소유자**. 던질지 선택할지를 여기서 결정한다.

**Files:**
- Create: `components/scene/SpawnController.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation`, `predictTrajectory`, `BODY_PRESETS`, `radiusFromMass`
- Produces: `<SpawnController>` — 좌드래그 던지기 + 궤적 미리보기 + 좌클릭 선택

**동작 규칙:**
- pointerdown → 천체를 맞췄으면 `select` 모드, 빈 공간이면 `throw` 모드
- pointermove(throw) → 미리보기 갱신
- pointerup(throw, 드래그 6px 초과) → 스폰. 속도 = `(시작점 − 현재점) × SLING_K`
- pointerup(select, 드래그 6px 이하) → 선택
- pointerup(throw, 6px 이하) → 선택 해제

- [ ] **Step 1: `components/scene/SpawnController.tsx`**

```tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { predictTrajectory } from '@/lib/sim/predict';
import { BODY_PRESETS, radiusFromMass } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

/** 드래그 픽셀이 아니라 월드 거리에 비례한 초기 속도. 새총의 탄성 계수. */
const SLING_K = 0.06;
/** 이 픽셀 이하로 움직였으면 드래그가 아니라 클릭으로 본다. */
const CLICK_SLOP = 6;
const PREVIEW_POINTS = 400;

const ECLIPTIC = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export default function SpawnController() {
  const { gl, camera, raycaster } = useThree();
  const { engine, bodiesMeshRef, spawnMass, preset, setSelectedId } = useSimulation();

  const mode = useRef<'idle' | 'throw' | 'select'>('idle');
  const pressPx = useRef({ x: 0, y: 0 });
  const startWorld = useRef(new THREE.Vector3());
  const currentWorld = useRef(new THREE.Vector3());
  const pendingSelectId = useRef<number | null>(null);

  const ghostRef = useRef<THREE.Mesh>(null);
  const previewRef = useRef<THREE.Line>(null);
  const previewBuffer = useRef(new Float32Array(PREVIEW_POINTS * 3));

  /** 화면 좌표 → 황도면(y=0) 위의 월드 좌표. 성공하면 true. */
  const toPlane = useCallback(
    (e: PointerEvent, out: THREE.Vector3): boolean => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(ECLIPTIC, out) !== null;
    },
    [camera, gl, raycaster],
  );

  /** 포인터 아래에 천체가 있으면 그 id, 없으면 null */
  const pickBody = useCallback((): number | null => {
    const mesh = bodiesMeshRef.current;
    if (!mesh) return null;
    const hits = raycaster.intersectObject(mesh, false);
    const first = hits[0];
    if (!first || first.instanceId === undefined) return null;
    return engine.bodies.id[first.instanceId];
  }, [bodiesMeshRef, engine, raycaster]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 왼쪽 버튼만
      if (!toPlane(e, hit)) return;

      pressPx.current = { x: e.clientX, y: e.clientY };
      raycaster.setFromCamera(ndc, camera); // toPlane이 ndc를 채워 둔 상태
      const picked = pickBody();

      if (picked !== null) {
        mode.current = 'select';
        pendingSelectId.current = picked;
      } else {
        mode.current = 'throw';
        pendingSelectId.current = null;
        startWorld.current.copy(hit);
        currentWorld.current.copy(hit);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (mode.current !== 'throw') return;
      if (toPlane(e, hit)) currentWorld.current.copy(hit);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || mode.current === 'idle') return;

      const dx = e.clientX - pressPx.current.x;
      const dy = e.clientY - pressPx.current.y;
      const isClick = Math.hypot(dx, dy) <= CLICK_SLOP;

      if (mode.current === 'select') {
        if (isClick) setSelectedId(pendingSelectId.current);
      } else if (!isClick) {
        // 새총: 끈 방향의 반대쪽으로 날아간다
        const vx = (startWorld.current.x - currentWorld.current.x) * SLING_K;
        const vz = (startWorld.current.z - currentWorld.current.z) * SLING_K;
        engine.spawn({
          position: [startWorld.current.x, 0, startWorld.current.z],
          velocity: [vx, 0, vz],
          mass: spawnMass,
          color: BODY_PRESETS[preset].color,
        });
      } else {
        setSelectedId(null);
      }

      mode.current = 'idle';
      pendingSelectId.current = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, engine, gl, pickBody, preset, raycaster, setSelectedId, spawnMass, toPlane]);

  useFrame(() => {
    const ghost = ghostRef.current;
    const line = previewRef.current;
    if (!ghost || !line) return;

    const dragging = mode.current === 'throw';
    ghost.visible = dragging;
    line.visible = dragging;
    if (!dragging) return;

    ghost.position.copy(startWorld.current);
    ghost.scale.setScalar(radiusFromMass(spawnMass));

    const vx = (startWorld.current.x - currentWorld.current.x) * SLING_K;
    const vz = (startWorld.current.z - currentWorld.current.z) * SLING_K;

    const n = predictTrajectory(
      engine.bodies,
      [startWorld.current.x, 0, startWorld.current.z],
      [vx, 0, vz],
      previewBuffer.current,
      1 / 60,
    );

    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.array.set(previewBuffer.current);
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
  });

  return (
    <>
      <mesh ref={ghostRef} visible={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color="#7dd3fc" wireframe toneMapped={false} />
      </mesh>

      {/* eslint-disable-next-line react/no-unknown-property */}
      <line ref={previewRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(PREVIEW_POINTS * 3), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.7} toneMapped={false} />
      </line>
    </>
  );
}
```

> **주의:** JSX의 `<line>`은 HTML `<line>` SVG 요소와 이름이 겹쳐 TS가 혼동할 수 있다. 타입 오류가 나면 `<primitive object={...} />` 대신 다음처럼 명시한다:
> ```tsx
> const previewLine = useMemo(() => new THREE.Line(
>   new THREE.BufferGeometry().setAttribute('position',
>     new THREE.BufferAttribute(new Float32Array(PREVIEW_POINTS * 3), 3)),
>   new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7, toneMapped: false }),
> ), []);
> // ...
> <primitive object={previewLine} ref={previewRef} visible={false} />
> ```

- [ ] **Step 2: `SpaceCanvas.tsx`에 SpawnController 추가**

`<CameraRig />` 아래에 `<SpawnController />`를 추가하고 import 한다.

- [ ] **Step 3: 검증 — 손으로 던져 본다**

```bash
pnpm check-types && pnpm lint && pnpm dev
```

브라우저에서 확인:
- 빈 공간을 **왼쪽 드래그**하면 반투명 구체(고스트)와 **파란 예상 궤적선**이 보인다.
- 끈 길이를 늘리면 궤적이 길어지고, 항성 근처를 지나면 **궤적이 휜다**.
- 놓으면 그 자리에 천체가 생기고 **예상대로 날아간다**.
- 항성 주위 적당한 속도로 던지면 **궤도에 얹힌다**.
- 천체를 **클릭**하면(드래그 없이) 카메라가 그것을 따라간다.
- 오른쪽 드래그 회전은 여전히 동작한다.

- [ ] **Step 4: 커밋**

```bash
git add components/scene/SpawnController.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 새총 던지기와 궤적 미리보기 추가

포인터 입력의 유일한 소유자. 황도면 레이캐스트로 깊이를 결정하고
드래그 중 실시간으로 예상 궤적을 그린다. 클릭은 선택으로 분기한다."
```

---

### Task 12: 궤적 (`components/scene/Trails.tsx`)

질량 상위 32개(+선택된 천체)만, 단일 `LineSegments`로.

**Files:**
- Create: `components/scene/Trails.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation`
- Produces: `<Trails>` — draw call 1회

- [ ] **Step 1: `components/scene/Trails.tsx`**

```tsx
'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSimulation } from '@/state/SimulationProvider';

const TRACKED = 32;        // 궤적을 남길 천체 수
const POINTS = 120;        // 천체당 궤적 점 개수
const SAMPLE_DT = 0.05;    // 시뮬레이션 시간 기준 샘플 간격 (배속과 무관하게 일정한 길이)
const RETARGET_DT = 0.5;   // 상위 32개를 다시 고르는 주기

const SEG_PER_BODY = POINTS - 1;
const VERTS = TRACKED * SEG_PER_BODY * 2;

export default function Trails() {
  const { engine, showTrails, selectedId } = useSimulation();
  const meshRef = useRef<THREE.LineSegments>(null);

  // 슬롯별 링버퍼. 매 프레임 할당하지 않는다.
  const slots = useRef({
    ids: new Int32Array(TRACKED),        // 0 = 빈 슬롯
    history: new Float32Array(TRACKED * POINTS * 3),
    filled: new Int32Array(TRACKED),     // 슬롯별 채워진 점 개수
    head: new Int32Array(TRACKED),       // 링버퍼 쓰기 위치
  });

  const sampleTimer = useRef(0);
  const retargetTimer = useRef(RETARGET_DT); // 첫 프레임에 즉시 타깃 선정

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.visible = showTrails;
    if (!showTrails) return;

    const b = engine.bodies;
    const s = slots.current;

    // 1. 주기적으로 추적 대상 재선정: 질량 상위 + 선택된 천체
    retargetTimer.current += delta;
    if (retargetTimer.current >= RETARGET_DT) {
      retargetTimer.current = 0;

      const order = Array.from({ length: b.count }, (_, i) => i).sort(
        (x, y) => b.mass[y] - b.mass[x],
      );
      const next = order.slice(0, TRACKED).map((i) => b.id[i]);

      if (selectedId !== null && !next.includes(selectedId) && b.indexOfId(selectedId) !== -1) {
        next[next.length - 1] = selectedId;
      }

      for (let k = 0; k < TRACKED; k++) {
        const id = next[k] ?? 0;
        if (s.ids[k] !== id) {
          // 슬롯 주인이 바뀌면 그 슬롯의 이력을 버린다
          s.ids[k] = id;
          s.filled[k] = 0;
          s.head[k] = 0;
        }
      }
    }

    // 2. 시뮬레이션 시간 기준으로 샘플링 (배속을 올려도 궤적 길이가 일정하다)
    sampleTimer.current += delta * engine.timeScale;
    const shouldSample = !engine.paused && sampleTimer.current >= SAMPLE_DT;
    if (shouldSample) {
      sampleTimer.current = 0;

      for (let k = 0; k < TRACKED; k++) {
        const id = s.ids[k];
        if (id === 0) continue;
        const i = b.indexOfId(id);
        if (i === -1) {
          s.ids[k] = 0;
          s.filled[k] = 0;
          continue;
        }

        const base = (k * POINTS + s.head[k]) * 3;
        s.history[base] = b.posX[i];
        s.history[base + 1] = b.posY[i];
        s.history[base + 2] = b.posZ[i];

        s.head[k] = (s.head[k] + 1) % POINTS;
        if (s.filled[k] < POINTS) s.filled[k]++;
      }
    }

    // 3. 링버퍼 → LineSegments 정점 (오래된 점일수록 어둡게)
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = geometry.getAttribute('color') as THREE.BufferAttribute;
    const pArr = pos.array as Float32Array;
    const cArr = col.array as Float32Array;

    let v = 0;
    for (let k = 0; k < TRACKED; k++) {
      const id = s.ids[k];
      const n = s.filled[k];
      if (id === 0 || n < 2) continue;

      const i = b.indexOfId(id);
      const r = i === -1 ? 1 : b.colR[i];
      const g = i === -1 ? 1 : b.colG[i];
      const bl = i === -1 ? 1 : b.colB[i];

      // 가장 오래된 점부터 순서대로 잇는다
      const start = (s.head[k] - n + POINTS) % POINTS;
      for (let p = 0; p < n - 1; p++) {
        const a = (start + p) % POINTS;
        const c = (start + p + 1) % POINTS;
        const fade = p / (n - 1); // 0=오래됨, 1=최신

        for (const [idx, alpha] of [
          [a, fade],
          [c, fade],
        ] as const) {
          const src = (k * POINTS + idx) * 3;
          pArr[v * 3] = s.history[src];
          pArr[v * 3 + 1] = s.history[src + 1];
          pArr[v * 3 + 2] = s.history[src + 2];
          cArr[v * 3] = r * alpha;
          cArr[v * 3 + 1] = g * alpha;
          cArr[v * 3 + 2] = bl * alpha;
          v++;
        }
      }
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, v);
  });

  return (
    <lineSegments ref={meshRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} />
    </lineSegments>
  );
}
```

- [ ] **Step 2: `SpaceCanvas.tsx`에 Trails 추가**

`<Bodies />` **뒤에** `<Trails />`를 추가한다. (Bodies가 먼저 step하므로 Trails는 갱신된 위치를 읽는다.)

- [ ] **Step 3: 검증**

```bash
pnpm check-types && pnpm lint && pnpm dev
```

브라우저에서 확인:
- 항성과 행성 뒤로 **꼬리처럼 궤적이 그려진다.**
- 궤적은 최신 부분이 밝고 오래된 부분이 어둡다.
- 배속을 나중에 붙일 UI로 바꿔도 궤적 길이가 크게 변하지 않아야 한다(지금은 코드에서 `engine.timeScale`을 직접 바꿔 확인해도 된다).
- 소행성 수십 개에는 궤적이 없다(상위 32개만).

- [ ] **Step 4: 커밋**

```bash
git add components/scene/Trails.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 질량 상위 32개 궤적 렌더 추가

링버퍼를 단일 LineSegments로 뽑아 draw call 1회로 그린다.
시뮬레이션 시간 기준 샘플링이라 배속과 무관하게 길이가 일정하다."
```

---

### Task 13: 블룸 (`components/scene/SpaceCanvas.tsx`)

**Files:**
- Modify: `components/scene/SpaceCanvas.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: 없음 (시각 효과)

- [ ] **Step 1: 설치**

```bash
pnpm add @react-three/postprocessing postprocessing
```

- [ ] **Step 2: `SpaceCanvas.tsx`에 EffectComposer 추가**

`<Canvas>`의 마지막 자식으로 넣는다. import는 `@react-three/postprocessing`에서.

```tsx
<EffectComposer>
  <Bloom
    intensity={1.1}
    luminanceThreshold={0.25}
    luminanceSmoothing={0.3}
    mipmapBlur
  />
</EffectComposer>
```

- [ ] **Step 3: 검증**

```bash
pnpm check-types && pnpm lint && pnpm build && pnpm dev
```

브라우저에서 확인:
- 항성이 **번지듯 빛난다.**
- 프레임이 눈에 띄게 떨어지지 않는다.

> **버전 충돌 대응:** `@react-three/postprocessing`이 R3F 9 / three 0.184와 안 맞아 빌드가 깨지면, 이 태스크를 **되돌리고**(`pnpm remove @react-three/postprocessing postprocessing`) 대신 `Bodies.tsx`의 재질을 유지한 채 각 천체에 drei의 `<Sprite>` 글로우를 얹는 방식으로 대체한다. 그 경우 **설계 문서 §5의 블룸 문단을 수정하고 그 이유를 적는다.**

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 블룸 포스트프로세싱 추가

네온 사이파이 톤의 핵심. 발광 재질만으로는 빛나는 느낌이 나오지 않는다."
```

---

### Task 14: UI 오버레이

Canvas 위에 얹는 DOM. 컨테이너는 `pointer-events-none`, 패널만 `pointer-events-auto`로 되돌려 **패널 바깥 클릭이 던지기를 방해하지 않게** 한다.

**Files:**
- Create: `components/ui/StatsHud.tsx`, `components/ui/ControlPanel.tsx`, `components/ui/SpawnPanel.tsx`, `components/ui/BodyCard.tsx`, `components/ui/Overlay.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useSimulation`, `BODY_PRESETS`, `radiusFromMass`
- Produces: `<Overlay>` — 4개 패널을 배치하는 컨테이너

- [ ] **Step 1: `components/ui/StatsHud.tsx`**

```tsx
'use client';

import { useSimulation } from '@/state/SimulationProvider';

export default function StatsHud() {
  const { stats } = useSimulation();

  return (
    <div className="pointer-events-auto rounded-lg border border-sky-400/20 bg-slate-950/70 px-4 py-3 font-mono text-xs text-sky-100/90 backdrop-blur">
      <div className="flex gap-4">
        <span>
          천체 <span className="text-sky-300">{stats.count}</span>
        </span>
        <span>
          경과 <span className="text-sky-300">{stats.simTime.toFixed(1)}</span>s
        </span>
        <span>
          FPS <span className="text-sky-300">{stats.fps}</span>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `components/ui/ControlPanel.tsx`**

```tsx
'use client';

import { useSimulation } from '@/state/SimulationProvider';

const SPEEDS = [0.25, 1, 4, 16];

export default function ControlPanel() {
  const { paused, setPaused, timeScale, setTimeScale, resetScene } = useSimulation();

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-sky-400/20 bg-slate-950/70 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        className="rounded-full bg-sky-500/20 px-4 py-1.5 text-sm text-sky-100 transition hover:bg-sky-500/40"
      >
        {paused ? '재생' : '일시정지'}
      </button>

      <div className="mx-1 h-5 w-px bg-sky-400/20" />

      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setTimeScale(s)}
          className={`rounded-full px-3 py-1.5 font-mono text-xs transition ${
            timeScale === s
              ? 'bg-sky-400 text-slate-950'
              : 'text-sky-200/70 hover:bg-sky-500/20'
          }`}
        >
          {s}×
        </button>
      ))}

      <div className="mx-1 h-5 w-px bg-sky-400/20" />

      <button
        type="button"
        onClick={resetScene}
        className="rounded-full px-3 py-1.5 text-sm text-sky-200/70 transition hover:bg-rose-500/30 hover:text-rose-100"
      >
        리셋
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `components/ui/SpawnPanel.tsx`**

```tsx
'use client';

import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

const PRESET_KEYS: PresetKey[] = ['asteroid', 'planet', 'star'];

export default function SpawnPanel() {
  const { preset, setPreset, spawnMass, setSpawnMass, showTrails, setShowTrails } =
    useSimulation();

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/20 bg-slate-950/70 p-4 backdrop-blur">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-sky-300/80 uppercase">
        던질 천체
      </h2>

      <div className="mb-4 grid grid-cols-3 gap-1">
        {PRESET_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={`rounded px-2 py-2 text-xs transition ${
              preset === k
                ? 'bg-sky-400 text-slate-950'
                : 'bg-sky-500/10 text-sky-200/70 hover:bg-sky-500/25'
            }`}
          >
            {BODY_PRESETS[k].label}
          </button>
        ))}
      </div>

      <label className="mb-1 block font-mono text-xs text-sky-200/70">
        질량 {spawnMass.toFixed(1)}
      </label>
      <input
        type="range"
        min={0.1}
        max={5000}
        step={0.1}
        value={spawnMass}
        onChange={(e) => setSpawnMass(Number(e.target.value))}
        className="mb-4 w-full accent-sky-400"
      />

      <label className="flex cursor-pointer items-center gap-2 text-xs text-sky-200/70">
        <input
          type="checkbox"
          checked={showTrails}
          onChange={(e) => setShowTrails(e.target.checked)}
          className="accent-sky-400"
        />
        궤적 표시
      </label>

      <p className="mt-4 border-t border-sky-400/10 pt-3 text-[11px] leading-relaxed text-slate-400">
        빈 공간을 <b className="text-sky-300">왼쪽 드래그</b>해서 던지고,
        <br />
        <b className="text-sky-300">오른쪽 드래그</b>로 카메라를 돌립니다.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: `components/ui/BodyCard.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';

interface Info {
  mass: number;
  radius: number;
  speed: number;
}

export default function BodyCard() {
  const { engine, selectedId, setSelectedId } = useSimulation();
  const [info, setInfo] = useState<Info | null>(null);

  // 선택된 천체의 수치는 10Hz로만 읽는다. 매 프레임 리렌더할 이유가 없다.
  useEffect(() => {
    if (selectedId === null) {
      setInfo(null);
      return;
    }

    const tick = () => {
      const b = engine.bodies;
      const i = b.indexOfId(selectedId);
      if (i === -1) {
        setSelectedId(null); // 병합되어 사라졌다
        return;
      }
      setInfo({
        mass: b.mass[i],
        radius: b.radius[i],
        speed: Math.hypot(b.velX[i], b.velY[i], b.velZ[i]),
      });
    };

    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [engine, selectedId, setSelectedId]);

  if (selectedId === null || !info) return null;

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/30 bg-slate-950/80 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-widest text-sky-300 uppercase">
          #{selectedId}
        </h2>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-xs text-slate-400 transition hover:text-sky-200"
        >
          닫기
        </button>
      </div>

      <dl className="space-y-1 font-mono text-xs text-sky-100/80">
        <div className="flex justify-between">
          <dt className="text-slate-400">질량</dt>
          <dd>{info.mass.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">반지름</dt>
          <dd>{info.radius.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">속력</dt>
          <dd>{info.speed.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 5: `components/ui/Overlay.tsx`**

```tsx
'use client';

import BodyCard from './BodyCard';
import ControlPanel from './ControlPanel';
import SpawnPanel from './SpawnPanel';
import StatsHud from './StatsHud';

export default function Overlay() {
  return (
    // 컨테이너는 클릭을 통과시킨다. 패널만 pointer-events-auto로 되돌린다.
    <div className="pointer-events-none absolute inset-0 z-10 p-4">
      <div className="absolute top-4 left-4">
        <StatsHud />
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-3">
        <SpawnPanel />
        <BodyCard />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <ControlPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `app/page.tsx`에 Overlay 추가**

```tsx
import SpaceCanvas from '@/components/scene/SpaceCanvas';
import Overlay from '@/components/ui/Overlay';
import { SimulationProvider } from '@/state/SimulationProvider';

export default function Home() {
  return (
    <SimulationProvider>
      <main className="relative h-dvh w-dvw overflow-hidden">
        <SpaceCanvas />
        <Overlay />
      </main>
    </SimulationProvider>
  );
}
```

- [ ] **Step 7: 검증**

```bash
pnpm check-types && pnpm lint && pnpm dev
```

브라우저에서 확인:
- 좌상단 HUD의 **천체 수가 병합될 때마다 줄어든다.**
- 일시정지를 누르면 **모든 것이 멈춘다.** 다시 누르면 이어서 움직인다.
- 16×를 누르면 눈에 띄게 빨라진다.
- 프리셋을 "항성"으로 바꾸고 던지면 **큰 주황색 천체**가 나온다.
- 천체를 클릭하면 우측에 정보 카드가 뜨고, 그 천체가 다른 천체에 **먹히면 카드가 자동으로 닫힌다.**
- 패널 위에서 드래그해도 **천체가 던져지지 않는다.**
- 리셋을 누르면 시작 항성계로 돌아간다.

- [ ] **Step 8: 커밋**

```bash
git add components/ui app/page.tsx
git commit -m "feat(ui): DOM 오버레이 추가

상태 HUD, 배속/일시정지/리셋, 스폰 패널, 선택 천체 카드.
컨테이너는 클릭을 통과시켜 던지기를 방해하지 않는다."
```

---

### Task 15: 최종 검증 및 문서 정리

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`

- [ ] **Step 1: 전체 게이트 통과**

```bash
pnpm test && pnpm check-types && pnpm lint && pnpm build
```

기대: 31 passed, 타입/린트/빌드 모두 통과.

- [ ] **Step 2: 부하 확인 — 수백 개를 실제로 던져 본다**

```bash
pnpm dev
```

소행성 프리셋으로 200개 이상 던져 넣고 확인:
- FPS가 **30 아래로 떨어지지 않는다.**
- 천체들이 서로 뭉쳐 **점점 큰 덩어리로 응집한다.**
- 콘솔에 `[sim] 오염된 천체 제거` 경고가 **반복해서 뜨지 않는다.** (한두 번은 정상, 계속 뜨면 소프트닝이 부족한 것이다 → `SOFTENING`을 키우고 설계 문서 §4에 기록한다.)

> FPS가 무너지면 우선 `MAX_SUBSTEPS`를 32 → 16으로 낮춘다. 배속 16×의 정확도가 떨어질 뿐 폭발하지는 않는다. 조정했다면 설계 문서 §4에 반드시 기록한다.

- [ ] **Step 3: `README.md` 재작성**

```markdown
# Outer Space Sandbox

천체를 던지면 중력으로 서로 끌어당기고, 부딪히면 하나로 합쳐지는 N-body 우주 샌드박스.

## 조작

| 입력 | 동작 |
|---|---|
| 왼쪽 드래그 (빈 공간) | 새총처럼 천체 던지기 (드래그 중 예상 궤적 표시) |
| 왼쪽 클릭 (천체) | 선택 — 정보 카드 표시, 카메라가 추적 |
| 오른쪽 드래그 | 카메라 회전 |
| 휠 | 줌 |
| 가운데 드래그 | 팬 |

## 개발

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # 물리 엔진 테스트
pnpm check-types
pnpm lint
pnpm build
```

## 구조

- `lib/sim/` — 순수 TypeScript 물리 엔진. React도 three.js도 모르며, 테스트 대상이다.
- `components/scene/` — React Three Fiber. 엔진 배열을 읽어 그리기만 한다.
- `components/ui/` — Canvas 위의 DOM 오버레이.
- `state/` — 엔진 인스턴스와 UI state의 소유자.

**핵심 규칙:** 천체의 위치·속도는 React state에 들어가지 않는다. 엔진의 `Float64Array`에만 존재하며, `useFrame`이 매 프레임 읽어 `InstancedMesh`에 직접 쓴다.

설계 근거는 [`docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`](docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md)에 있다. 로드맵 2~4단계(신의 손 / 시나리오 프리셋 / 우주선 조종)도 그 문서에 정리되어 있다.
```

- [ ] **Step 4: 설계 문서 최종 동기화**

`docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`의 상단 상태 줄을 바꾼다.

```markdown
- 상태: 1단계 구현 완료 (2026-07-14)
```

구현 중 실제로 바꾼 수치(`SOFTENING`, `MAX_SUBSTEPS`, 궤적 개수 등)가 문서와 다르면 **지금 전부 일치시킨다.**

- [ ] **Step 5: 커밋**

```bash
git add README.md docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md
git commit -m "docs: README 재작성 및 설계 문서 구현 결과 동기화"
```

---

## 완료 기준

- [ ] `pnpm test` 31개 통과 (원궤도 100바퀴, 보존량, 결정론, NaN 격리 포함)
- [ ] `pnpm check-types`, `pnpm lint`, `pnpm build` 통과
- [ ] 시작 항성계가 안정적으로 공전한다
- [ ] 왼쪽 드래그로 던질 수 있고, 드래그 중 예상 궤적이 보이며, 실제로 그 궤적대로 날아간다
- [ ] 천체 200개 이상에서 30fps 이상
- [ ] 천체들이 병합되며 큰 덩어리로 응집한다
- [ ] 설계 문서가 실제 구현과 일치한다
