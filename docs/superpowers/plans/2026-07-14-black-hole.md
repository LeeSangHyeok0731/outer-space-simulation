# 2단계 블랙홀 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질량 한계를 넘은 천체가 블랙홀로 붕괴하고, ISCO 안으로 들어온 것은 무엇이든 삼키며, 작은 블랙홀은 호킹 복사로 증발하는 2단계 신의 손을 만든다.

**Architecture:** 시뮬레이션 광속 `C` 하나를 도입하면 사건의 지평선(`r_s = 2M/C²`), 흡수 반경(ISCO = `3r_s`), 폭주 성장(`r_s ∝ M`), 호킹 증발(`dM/dt = -K/M²`)이 전부 파생된다. 블랙홀 로직은 `lib/sim/blackhole.ts`로 분리하고, 엔진의 `substep()`이 병합 직후 호출한다. 중력 자체는 손대지 않는다 — 블랙홀은 같은 질량의 항성과 똑같이 끌어당긴다.

**Tech Stack:** TypeScript(strict), Vitest, Next.js 16, React 19(React Compiler), React Three Fiber 9 + three 0.184, Tailwind v4

**설계 문서:** `docs/superpowers/specs/2026-07-14-black-hole-design.md` — 설계가 바뀌면 코드와 **같은 커밋에서** 이 문서를 갱신한다.

## Global Constraints

- 패키지 매니저는 **pnpm**.
- TypeScript `strict: true`. **`any` 금지, 타입 문제를 피하려는 `as` 단언 금지.**
- `lib/sim/`은 **React도 three.js도 import하지 않는다.** 순수 TS이며 Vitest로 검증한다.
- **천체의 위치·속도·질량은 React state에 넣지 않는다.** 엔진의 `Float64Array`에만 존재한다.
- **`useFrame` 안에서 할당하지 않는다.** 재사용 객체는 모듈 스코프에 둔다.
- `engine.step()`의 유일한 호출자는 `components/scene/Bodies.tsx`다. 새 씬 컴포넌트는 엔진을 **읽기만** 하며 `Bodies` 뒤에 마운트한다.
- 물리 상수(설계 문서 §2·§3·§4에서 확정): `C = 25`, `COLLAPSE_MASS = 3000`, `HAWKING_K = 0.2`, `EVAPORATION_FLOOR = 0.01`.
- 커밋은 Conventional Commits + 한국어 본문. 스코프: `sim`(`lib/sim/`), `scene`, `ui`, `state`, `docs`.
- 각 태스크 끝에서 `pnpm test`, `pnpm check-types`, `pnpm lint`가 통과해야 한다.

## 기존 코드에서 알아야 할 것

- `lib/sim/units.ts` — `G = 1`, `SOFTENING = 0.5`, `MAX_BODIES = 512`, `MIN_RADIUS = 0.3`, `BodyType = { NORMAL: 0, BLACK_HOLE: 1, SHIP: 2 }`, `BODY_PRESETS`, `radiusFromMass(mass)`. **`BodyType.BLACK_HOLE`은 1단계에서 이미 자리를 잡아 뒀다 — 새 플래그가 필요 없다.**
- `lib/sim/bodies.ts` — `BodyBuffer`(SoA): `posX/posY/posZ`, `velX/velY/velZ`, `accX/accY/accZ`, `mass`, `radius`, `type`(`Uint8Array`), `id`(`Int32Array`), `colR/colG/colB`(`Float32Array`), `pinned`(`Uint8Array`), `count`, `capacity`; `add`, `removeAt`(swap-remove), `removeById`, `indexOfId`, `clear`.
- `lib/sim/collisions.ts` — `resolveCollisions(b): boolean`과 private `mergeInto(b, i, j)`. 병합은 질량·운동량·부피를 보존하고, **고정(pinned)이 걸려 있으면 고정이 이긴다**(닻 위치 유지, 속도 0).
- `lib/sim/engine.ts` — `SimulationEngine`: `bodies`, `timeScale`, `paused`, `simTime`, `spawn`, `remove`, `setMass`, `setPinned`, `isPinned`, `applyImpulse`, `step`, `reset`, `serialize`, `load`. private `substep(dt)`가 `sanitize → computeAccelerations(accDirty면) → integrate → resolveCollisions → sanitize` 순으로 돈다.
- `components/ui/BodyCard.tsx` — 선택된 천체 정보를 100ms 간격으로 폴링해 표시. `위치 고정` 토글이 이미 있다.
- 테스트는 현재 59개.

---

### Task 1: 블랙홀 상수와 공식 (`lib/sim/units.ts`)

**Files:**
- Modify: `lib/sim/units.ts`
- Modify: `lib/sim/units.test.ts`

**Interfaces:**
- Consumes: 기존 `G`
- Produces:
  - `C = 25`, `COLLAPSE_MASS = 3000`, `HAWKING_K = 0.2`, `EVAPORATION_FLOOR = 0.01`
  - `schwarzschildRadius(mass: number): number` — `2·G·mass / C²`
  - `iscoRadius(mass: number): number` — `3 · schwarzschildRadius(mass)`

- [ ] **Step 1: 실패하는 테스트 추가 — `lib/sim/units.test.ts` 끝에 append**

```ts
describe('블랙홀 공식', () => {
  it('슈바르츠실트 반지름은 질량에 정비례한다 (폭주 성장의 근거)', () => {
    // 일반 천체는 r ∝ ∛m 이라 질량이 8배여야 반지름이 2배가 된다.
    // 블랙홀은 r ∝ m 이라 질량이 2배면 반지름도 2배다 — 먹을수록 훨씬 빨리 커진다.
    expect(schwarzschildRadius(2000) / schwarzschildRadius(1000)).toBeCloseTo(2, 10);
    expect(schwarzschildRadius(10000) / schwarzschildRadius(1000)).toBeCloseTo(10, 10);
  });

  it('설계 문서의 수치와 일치한다 (C = 25)', () => {
    expect(C).toBe(25);
    expect(schwarzschildRadius(3000)).toBeCloseTo(9.6, 6);
    expect(iscoRadius(3000)).toBeCloseTo(28.8, 6);
    expect(schwarzschildRadius(50000)).toBeCloseTo(160, 6);
  });

  it('ISCO는 사건의 지평선의 3배다', () => {
    for (const m of [1, 100, 3000, 50000]) {
      expect(iscoRadius(m)).toBeCloseTo(3 * schwarzschildRadius(m), 10);
    }
  });

  it('블랙홀 반지름에는 MIN_RADIUS 하한을 걸지 않는다', () => {
    // 아주 작은 블랙홀은 실제로 아주 작다. 보이지 않을 만큼 작아도 상관없다 —
    // 어차피 호킹 증발로 순식간에 사라진다.
    expect(schwarzschildRadius(0.5)).toBeLessThan(MIN_RADIUS);
  });

  it('붕괴 임계 질량은 항성 프리셋보다 크고 항성 둘보다 작다', () => {
    // 이래야 "항성 두 개를 충돌시키면 블랙홀이 된다"는 규칙이 성립한다.
    expect(COLLAPSE_MASS).toBeGreaterThan(BODY_PRESETS.star.mass);
    expect(COLLAPSE_MASS).toBeLessThan(BODY_PRESETS.star.mass * 2);
  });
});
```

파일 상단의 import 문에 새 심볼을 추가한다:

```ts
import {
  BODY_PRESETS,
  C,
  COLLAPSE_MASS,
  iscoRadius,
  MIN_RADIUS,
  radiusFromMass,
  schwarzschildRadius,
} from './units';
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test lib/sim/units.test.ts
```

기대: FAIL — `C`, `schwarzschildRadius` 등이 `./units`에 없다는 에러.

- [ ] **Step 3: 구현 — `lib/sim/units.ts` 끝에 append**

```ts
/**
 * 시뮬레이션 광속. 블랙홀의 모든 것이 이 상수 하나에서 파생된다.
 *
 * 실제 c(3e8 m/s)를 쓰면 태양질량 블랙홀의 사건의 지평선이 3km — 별 크기에 비해
 * 점에 불과해 화면에 보이지도, 아무것도 삼키지도 못한다. C를 작게 잡는다는 것은
 * "우리 우주는 빛이 느리다"고 정하는 것이고, 그 대가로 블랙홀이 손에 잡히는 크기가 된다.
 */
export const C = 25;

/**
 * 자동 붕괴 임계 질량. 이 이상이면 스스로 무너져 블랙홀이 된다.
 *
 * 찬드라세카르 한계(전자 축퇴압의 한계)와 TOV 한계(중성자 축퇴압의 한계)의 번안이다 —
 * "더 이상 버틸 브레이크가 없다"는 진짜 원리가 그대로 게임 규칙이 된다.
 * 항성 프리셋(2000) 둘을 충돌시키면 넘는 값이라, 발견 가능하고 극적이다.
 */
export const COLLAPSE_MASS = 3000;

/** 호킹 복사 계수. dM/dt = -HAWKING_K / M² — 작을수록 미친 듯이 빨리 증발한다. */
export const HAWKING_K = 0.2;

/** 증발하는 블랙홀이 이 질량 아래로 떨어지면 소멸시킨다. */
export const EVAPORATION_FLOOR = 0.01;

/**
 * 사건의 지평선 반지름. `r_s = 2GM/c²`
 *
 * 질량에 **정비례**한다는 것이 핵심이다. 일반 천체의 반지름은 `∛m`으로 굼뜨게 자라는데
 * (밀도 일정 가정, `radiusFromMass` 참고), 블랙홀은 먹을수록 흡수 반경이 선형으로 커진다.
 * 폭주 성장은 규칙으로 만든 것이 아니라 이 식에서 저절로 나온다.
 *
 * `MIN_RADIUS` 하한을 걸지 않는다 — 작은 블랙홀은 실제로 작고, 어차피 곧 증발한다.
 */
export function schwarzschildRadius(mass: number): number {
  return (2 * G * Math.abs(mass)) / (C * C);
}

/**
 * 최내부 안정 원궤도(ISCO) 반지름. 슈바르츠실트 블랙홀에서는 `3 r_s`다.
 *
 * **이 안쪽에는 안정 궤도가 존재하지 않는다.** 뉴턴 중력에서는 아무리 가까워도 빠르기만
 * 하면 궤도를 돌 수 있지만, 실제 블랙홀 근처에서는 어떤 속도로도 궤도를 유지할 수 없고
 * 나선을 그리며 빨려든다. 이 한 줄이 "블랙홀은 무거운 항성과 무엇이 다른가"에 대한 답이며,
 * 이 값이 곧 흡수 반경이 된다.
 */
export function iscoRadius(mass: number): number {
  return 3 * schwarzschildRadius(mass);
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test && pnpm check-types && pnpm lint
```

기대: 64 passed (기존 59 + 신규 5).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 블랙홀 상수와 공식 추가

시뮬레이션 광속 C 하나에서 사건의 지평선과 ISCO가 파생된다.
r_s가 질량에 정비례하므로 폭주 성장이 공식에서 저절로 나온다."
```

---

### Task 2: 붕괴와 증발 (`lib/sim/blackhole.ts`)

**Files:**
- Create: `lib/sim/blackhole.ts`, `lib/sim/blackhole.test.ts`

**Interfaces:**
- Consumes: `BodyBuffer`(Task 0/기존), `BodyType`, `COLLAPSE_MASS`, `HAWKING_K`, `EVAPORATION_FLOOR`, `schwarzschildRadius`(Task 1)
- Produces:
  - `isBlackHoleAt(b: BodyBuffer, i: number): boolean`
  - `collapseAt(b: BodyBuffer, i: number): void` — 강제 붕괴 (질량 무관)
  - `applyCollapse(b: BodyBuffer): boolean` — 임계 초과 자동 붕괴. 하나라도 붕괴했으면 `true`
  - `applyHawking(b: BodyBuffer, dt: number): boolean` — 증발 + 소멸. **천체가 사라졌을 때만 `true`**

**`applyHawking`의 반환값 계약에 주의할 것.** 질량이 줄어드는 것만으로는 `true`를 반환하지 **않는다**. 매 서브스텝 질량이 바뀐다고 `accDirty`를 세우면 블랙홀이 하나라도 존재하는 순간 가속도 재계산이 서브스텝당 두 번 일어나 **물리 비용이 2배가 된다**. 실제 한 스텝의 질량 변화는 무시할 만하고(M=3000에서 상대 변화 ~1e-13), `integrate()`가 어차피 매 스텝 내부에서 가속도를 다시 계산하므로 다음 스텝의 힘은 새 질량으로 계산된다. 반면 **천체가 사라지는 것**은 다른 천체들이 느끼는 힘을 실제로 바꾸므로 그때는 `true`를 반환한다.

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/blackhole.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyCollapse, applyHawking, collapseAt, isBlackHoleAt } from './blackhole';
import { BodyBuffer, type BodyInit } from './bodies';
import {
  BodyType,
  COLLAPSE_MASS,
  EVAPORATION_FLOOR,
  HAWKING_K,
  schwarzschildRadius,
} from './units';

const make = (over: Partial<BodyInit> = {}): BodyInit => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1, ...over,
});

/** 호킹 증발 시간의 해석해: dM/dt = -K/M² 를 적분하면 t = M³ / (3K) */
const evaporationTime = (m: number) => (m * m * m) / (3 * HAWKING_K);

describe('applyCollapse (자동 붕괴)', () => {
  it('임계 질량을 넘으면 스스로 블랙홀이 된다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS + 1, radius: 9 }));

    expect(applyCollapse(b)).toBe(true);
    expect(isBlackHoleAt(b, 0)).toBe(true);
  });

  it('임계 질량 미만이면 붕괴하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS - 1, radius: 9 }));

    expect(applyCollapse(b)).toBe(false);
    expect(isBlackHoleAt(b, 0)).toBe(false);
  });

  it('붕괴하면 반지름이 사건의 지평선으로 바뀐다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6 }));

    applyCollapse(b);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('붕괴하면 검게 변한다 (빛을 내지 않는다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6, color: [1, 0.7, 0.3] }));

    applyCollapse(b);
    expect(b.colR[0]).toBe(0);
    expect(b.colG[0]).toBe(0);
    expect(b.colB[0]).toBe(0);
  });

  it('이미 블랙홀인 천체는 다시 붕괴시키지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6 }));
    applyCollapse(b);

    expect(applyCollapse(b)).toBe(false); // 두 번째 호출은 아무 일도 안 한다
  });
});

describe('collapseAt (강제 붕괴 — 신의 손 치트)', () => {
  it('질량과 무관하게 블랙홀로 만든다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.5, radius: 0.3 })); // 소행성

    collapseAt(b, 0);
    expect(isBlackHoleAt(b, 0)).toBe(true);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(0.5), 10);
  });
});

describe('applyHawking (호킹 증발)', () => {
  it('블랙홀은 질량을 잃는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1);
    expect(b.mass[0]).toBeLessThan(100);
    expect(b.mass[0]).toBeCloseTo(100 - HAWKING_K / (100 * 100), 10);
  });

  it('질량이 줄어드는 것만으로는 true를 반환하지 않는다 (가속도 재계산 비용 회피)', () => {
    // 매 서브스텝 질량 변화로 accDirty를 세우면 블랙홀이 하나만 있어도 물리 비용이
    // 2배가 된다. 한 스텝의 질량 변화는 무시할 만하고(M=3000에서 상대 변화 ~1e-13),
    // integrate()가 어차피 매 스텝 내부에서 가속도를 다시 계산한다.
    const b = new BodyBuffer(4);
    b.add(make({ mass: 3000, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1 / 120)).toBe(false);
    expect(b.count).toBe(1);
  });

  it('천체가 사라질 때만 true를 반환한다 (다른 천체가 느끼는 힘이 실제로 바뀐다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.02, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1)).toBe(true);
    expect(b.count).toBe(0);
  });

  it('질량이 줄면 반지름도 함께 줄어든다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(b.mass[0]), 10);
  });

  it('일반 천체는 증발하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));

    expect(applyHawking(b, 1)).toBe(false);
    expect(b.mass[0]).toBe(100);
  });

  it('작은 블랙홀은 소멸한다 — 치트를 물리가 정리한다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 1, radius: 1 }));
    collapseAt(b, 0);

    // 질량 1의 증발 시간은 약 1.67초. 넉넉히 3초를 굴린다.
    const dt = 1 / 120;
    for (let s = 0; s < 3 / dt && b.count > 0; s++) applyHawking(b, dt);

    expect(b.count).toBe(0);
  });

  it('큰 블랙홀은 사실상 증발하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS, radius: 1 }));
    collapseAt(b, 0);

    // 증발 시간이 우주적으로 길다는 것을 해석해로 먼저 확인한다.
    expect(evaporationTime(COLLAPSE_MASS)).toBeGreaterThan(1e9);

    const dt = 1 / 120;
    for (let s = 0; s < 60 / dt; s++) applyHawking(b, dt); // 60 시뮬레이션-초

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeGreaterThan(COLLAPSE_MASS * 0.999);
  });

  it('질량이 바닥 아래로 내려가도 음수가 되지 않는다 (제거된다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: EVAPORATION_FLOOR * 2, radius: 1 }));
    collapseAt(b, 0);

    // 아주 작은 질량에서는 dM/dt가 폭발적으로 커서 한 스텝에 음수로 넘어갈 수 있다.
    applyHawking(b, 1);
    expect(b.count).toBe(0);
  });

  it('여러 블랙홀 중 하나만 소멸해도 나머지는 멀쩡하다 (swap-remove 안전성)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.05, radius: 1 })); // 곧 사라질 것
    b.add(make({ mass: COLLAPSE_MASS, radius: 1 })); // 멀쩡할 것
    collapseAt(b, 0);
    collapseAt(b, 1);

    applyHawking(b, 1);

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeGreaterThan(COLLAPSE_MASS * 0.999);
    expect(isBlackHoleAt(b, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test lib/sim/blackhole.test.ts
```

기대: FAIL — `Failed to resolve import "./blackhole"`

- [ ] **Step 3: 구현 — `lib/sim/blackhole.ts`**

```ts
import type { BodyBuffer } from './bodies';
import {
  BodyType,
  COLLAPSE_MASS,
  EVAPORATION_FLOOR,
  HAWKING_K,
  schwarzschildRadius,
} from './units';

export function isBlackHoleAt(b: BodyBuffer, i: number): boolean {
  return b.type[i] === BodyType.BLACK_HOLE;
}

/**
 * 천체를 블랙홀로 만든다. 질량은 건드리지 않는다 — 반지름이 사건의 지평선으로 줄고
 * 색이 검게 바뀔 뿐이다.
 *
 * 중력이 변하지 않는다는 점이 중요하다. 태양을 같은 질량의 블랙홀로 바꿔도 지구 궤도는
 * 변하지 않는다. 멀리 있는 천체는 아무것도 눈치채지 못한다.
 */
export function collapseAt(b: BodyBuffer, i: number): void {
  b.type[i] = BodyType.BLACK_HOLE;
  b.radius[i] = schwarzschildRadius(b.mass[i]);
  b.colR[i] = 0;
  b.colG[i] = 0;
  b.colB[i] = 0;
}

/**
 * 임계 질량을 넘은 천체를 자동으로 붕괴시킨다.
 *
 * 병합으로 살을 찌우다 어느 순간 '탁' 하고 무너지는 순간이 이 함수에서 나온다.
 *
 * @returns 하나라도 붕괴했으면 true
 */
export function applyCollapse(b: BodyBuffer): boolean {
  let collapsed = false;

  for (let i = 0; i < b.count; i++) {
    if (b.type[i] === BodyType.BLACK_HOLE) continue;
    if (b.mass[i] < COLLAPSE_MASS) continue;

    collapseAt(b, i);
    collapsed = true;
  }

  return collapsed;
}

/**
 * 호킹 복사. `dM/dt = -K / M²`
 *
 * 작을수록 미친 듯이 빨리 증발한다(증발 시간 ∝ M³). 치트 버튼으로 만든 소행성 블랙홀은
 * 흡수 반경이 거의 0이라 아무것도 못 먹고, 증발률이 폭발해 순식간에 사라진다.
 * 밸런스를 위해 지어낸 제약이 아니라 실제 물리가 말하는 바다 — 치트를 막을 필요가 없다.
 *
 * 질량이 아주 작아지면 한 스텝의 감소량이 질량 자체를 넘어설 수 있으므로(dM/dt가 발산),
 * 바닥 아래로 내려가면 음수가 되기 전에 제거한다.
 *
 * @returns **천체가 사라졌을 때만** true (호출자는 그때만 가속도를 다시 계산하면 된다).
 *
 * 질량이 줄어드는 것만으로는 true를 반환하지 않는다. 매 서브스텝 질량 변화로
 * 가속도를 무효화하면 블랙홀이 하나만 있어도 재계산이 서브스텝당 두 번 일어나 물리
 * 비용이 2배가 된다. 한 스텝의 질량 변화는 무시할 만하고(M=3000에서 상대 변화 ~1e-13),
 * integrate()가 어차피 매 스텝 내부에서 가속도를 다시 계산하므로 다음 스텝의 힘은
 * 새 질량으로 계산된다. 반면 천체가 사라지는 것은 다른 천체들이 느끼는 힘을 실제로 바꾼다.
 */
export function applyHawking(b: BodyBuffer, dt: number): boolean {
  let removed = false;

  // 뒤에서부터 도는 이유: removeAt은 swap-remove라 마지막 원소를 빈자리로 옮긴다.
  // 앞에서부터 돌면 방금 옮겨온 원소를 건너뛰게 된다.
  for (let i = b.count - 1; i >= 0; i--) {
    if (b.type[i] !== BodyType.BLACK_HOLE) continue;

    const m = b.mass[i];
    const next = m - (HAWKING_K / (m * m)) * dt;

    if (next <= EVAPORATION_FLOOR) {
      b.removeAt(i);
      removed = true;
      continue;
    }

    b.mass[i] = next;
    b.radius[i] = schwarzschildRadius(next);
  }

  return removed;
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test && pnpm check-types && pnpm lint
```

기대: 78 passed (64 + 신규 14).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/blackhole.ts lib/sim/blackhole.test.ts
git commit -m "feat(sim): 블랙홀 붕괴와 호킹 증발 추가

임계 질량을 넘으면 자동 붕괴하고, 블랙홀은 dM/dt = -K/M² 로 증발한다.
작을수록 빨리 증발하므로 치트로 만든 작은 블랙홀은 물리가 스스로 정리한다."
```

---

### Task 3: ISCO 흡수와 블랙홀 병합 (`lib/sim/collisions.ts`)

**이 태스크가 설계의 핵심이다.** 블랙홀이 무거운 항성과 다른 유일한 지점이다.

**Files:**
- Modify: `lib/sim/collisions.ts`
- Modify: `lib/sim/collisions.test.ts`

**Interfaces:**
- Consumes: `BodyType`, `iscoRadius`, `schwarzschildRadius`(Task 1), `isBlackHoleAt`(Task 2)
- Produces: `resolveCollisions(b): boolean` (시그니처 불변, 동작 확장)

**동작 규칙 (설계 문서 §5):**
- 둘 다 일반 천체 → 기존 규칙: `거리 < 반지름 합`
- 한쪽이라도 블랙홀 → `거리 < ISCO` (블랙홀이 둘이면 둘 중 큰 ISCO). **상대의 속도와 무관하다.**
- 병합 결과: 블랙홀이 있으면 **항상 블랙홀이 이긴다.** 질량이 작아도 그렇다.
- 블랙홀의 반지름은 `schwarzschildRadius(m_total)` — 부피 보존(`∛(r₁³+r₂³)`)을 쓰지 않는다.
- 위치·속도·고정(pinned) 규칙은 기존 그대로.

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/collisions.test.ts` 끝에 append**

```ts
describe('블랙홀의 흡수', () => {
  it('ISCO 안에 들어오면 원궤도 속도로 돌고 있어도 삼켜진다', () => {
    // 이것이 이 설계의 핵심이다. 뉴턴 중력에서는 아무리 가까워도 빠르기만 하면
    // 궤도를 돌 수 있다. 실제 블랙홀 근처에는 안정 궤도가 없다.
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const isco = iscoRadius(bhMass);
    const r = isco * 0.9; // ISCO 안쪽
    const vCircular = Math.sqrt((G * bhMass) / r); // 완벽한 원궤도 속도

    b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: vCircular, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(true);
    expect(b.count).toBe(1); // 궤도 속도를 갖고 있어도 소용없다
  });

  it('ISCO 밖에서는 삼켜지지 않는다 (중력은 그대로다)', () => {
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const r = iscoRadius(bhMass) * 1.1; // ISCO 바깥
    b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(false);
    expect(b.count).toBe(2);
  });

  it('블랙홀의 흡수 반경은 사건의 지평선보다 훨씬 크다', () => {
    // 검은 구(r_s)에 닿기 한참 전에 이미 삼켜진다.
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const rs = schwarzschildRadius(bhMass);
    b.add({ x: rs * 2.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(true); // r_s의 2.5배 거리인데도 삼켜진다 (ISCO = 3 r_s)
  });

  it('블랙홀이 이긴다: 가벼운 블랙홀이 무거운 항성을 먹어도 결과는 블랙홀', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    const bhId = b.id[0];

    // 훨씬 무거운 항성을 ISCO 안에 놓는다
    b.add({ x: iscoRadius(1000) * 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 9000, radius: 12 });

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(b.id[0]).toBe(bhId); // 정체성도 블랙홀 쪽을 물려받는다
    expect(b.mass[0]).toBeCloseTo(10000, 6);
    expect(b.colR[0]).toBe(0); // 여전히 검다
  });

  it('블랙홀의 반지름은 부피 합성이 아니라 사건의 지평선이다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    b.add({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 8 });

    resolveCollisions(b);

    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('블랙홀끼리 병합하면 질량이 합쳐진 블랙홀이 된다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(b.mass[0]).toBeCloseTo(8000, 6);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(8000), 10);
  });

  it('일반 천체끼리는 기존 규칙 그대로다 (부피 보존)', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 3 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 4 });

    resolveCollisions(b);

    expect(b.type[0]).toBe(BodyType.NORMAL);
    expect(b.radius[0]).toBeCloseTo(Math.cbrt(27 + 64), 10);
  });

  it('고정된 블랙홀은 먹어도 밀리지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5000, radius: 1, pinned: true });
    collapseAt(b, 0);
    b.add({ x: 110, y: 0, z: 0, vx: -50, vy: 0, vz: 0, mass: 100, radius: 1 });

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.posX[0]).toBe(100);
    expect(b.velX[0]).toBe(0);
    expect(b.pinned[0]).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
  });
});
```

파일 상단의 import를 확장한다:

```ts
import { collapseAt } from './blackhole';
import { BodyBuffer } from './bodies';
import { resolveCollisions } from './collisions';
import { BodyType, G, iscoRadius, schwarzschildRadius } from './units';
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test lib/sim/collisions.test.ts
```

기대: FAIL — ISCO 흡수가 구현되지 않아 "ISCO 안에 들어오면 …" 등이 실패한다.

- [ ] **Step 3: 구현 — `lib/sim/collisions.ts`**

파일 상단 import를 교체한다:

```ts
import type { BodyBuffer } from './bodies';
import { BodyType, iscoRadius, schwarzschildRadius } from './units';
```

`mergeInto` 바로 위에 흡수 거리 계산을 추가한다:

```ts
/**
 * 두 천체가 합쳐지는 거리.
 *
 * 일반 천체끼리는 표면이 닿을 때(반지름 합)다. 블랙홀은 다르다 — **ISCO 안에 들어오면
 * 속도와 무관하게 삼켜진다.** 뉴턴 중력에서는 아무리 가까워도 빠르기만 하면 궤도를 돌 수
 * 있지만, 실제 블랙홀 근처(3 r_s 안쪽)에는 안정 궤도가 존재하지 않고 무엇이든 나선을
 * 그리며 빨려든다. 이 한 줄이 블랙홀을 '검은 항성'이 아니게 만든다.
 */
function captureDistance(b: BodyBuffer, i: number, j: number): number {
  const iBH = b.type[i] === BodyType.BLACK_HOLE;
  const jBH = b.type[j] === BodyType.BLACK_HOLE;

  if (!iBH && !jBH) return b.radius[i] + b.radius[j];

  // 블랙홀이 둘이면 더 큰 ISCO가 이긴다.
  let d = 0;
  if (iBH) d = Math.max(d, iscoRadius(b.mass[i]));
  if (jBH) d = Math.max(d, iscoRadius(b.mass[j]));
  return d;
}
```

`mergeInto` 안에서 정체성 승계와 반지름 결정을 고친다. 기존의

```ts
  if (m2 > m1) {
    b.id[i] = b.id[j];
    b.type[i] = b.type[j];
    b.colR[i] = b.colR[j];
    b.colG[i] = b.colG[j];
    b.colB[i] = b.colB[j];
  }

  b.mass[i] = m;
  b.radius[i] = radius;
```

부분을 아래로 교체한다:

```ts
  const iBH = b.type[i] === BodyType.BLACK_HOLE;
  const jBH = b.type[j] === BodyType.BLACK_HOLE;
  const anyBH = iBH || jBH;

  // 정체성(id·색·타입): 보통은 무거운 쪽이 이기지만, **블랙홀이 있으면 블랙홀이 이긴다.**
  // 가벼운 블랙홀이 무거운 항성을 삼켜도 결과는 블랙홀이다.
  const takeJ = iBH !== jBH ? jBH : m2 > m1;
  if (takeJ) {
    b.id[i] = b.id[j];
    b.type[i] = b.type[j];
    b.colR[i] = b.colR[j];
    b.colG[i] = b.colG[j];
    b.colB[i] = b.colB[j];
  }

  b.mass[i] = m;

  if (anyBH) {
    // 블랙홀의 반지름은 부피 합성이 아니라 사건의 지평선이다.
    b.type[i] = BodyType.BLACK_HOLE;
    b.radius[i] = schwarzschildRadius(m);
    b.colR[i] = 0;
    b.colG[i] = 0;
    b.colB[i] = 0;
  } else {
    b.radius[i] = radius;
  }
```

`resolveCollisions`의 거리 판정을 `captureDistance`로 바꾼다. 기존의

```ts
      const rsum = b.radius[i] + b.radius[j];

      if (dx * dx + dy * dy + dz * dz < rsum * rsum) {
```

을 아래로 교체한다:

```ts
      const capture = captureDistance(b, i, j);

      if (dx * dx + dy * dy + dz * dz < capture * capture) {
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test && pnpm check-types && pnpm lint
```

기대: 86 passed (78 + 신규 8).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/collisions.ts lib/sim/collisions.test.ts
git commit -m "feat(sim): ISCO 흡수와 블랙홀 병합 규칙 추가

블랙홀은 ISCO(3 r_s) 안에 들어온 것을 속도와 무관하게 삼킨다.
뉴턴 중력에서는 아무리 가까워도 빠르면 궤도를 돌 수 있지만, 실제 블랙홀
근처에는 안정 궤도가 없다 — 이 차이가 블랙홀을 '검은 항성'이 아니게 만든다.

병합에서는 블랙홀이 이긴다. 가벼운 블랙홀이 무거운 항성을 먹어도 결과는
블랙홀이고, 반지름은 부피 합성이 아니라 사건의 지평선이다."
```

---

### Task 4: 엔진 배선 (`lib/sim/engine.ts`)

**Files:**
- Modify: `lib/sim/engine.ts`
- Modify: `lib/sim/engine.test.ts`

**Interfaces:**
- Consumes: `applyCollapse`, `applyHawking`, `collapseAt`, `isBlackHoleAt`(Task 2)
- Produces:
  - `SimulationEngine.collapseToBlackHole(id: number): void` — 치트 버튼용
  - `SimulationEngine.isBlackHole(id: number): boolean`

**substep 순서 (중요):** `integrate` → `resolveCollisions` → **`applyCollapse`** → **`applyHawking`** → `sanitize`.
병합이 질량을 바꾸므로 붕괴 검사는 병합 **뒤**에 와야 "항성 둘이 합쳐지는 순간 붕괴"가 성립한다. 증발은 갓 생긴 블랙홀에도 곧바로 적용된다.

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/engine.test.ts` 끝에 append**

```ts
describe('SimulationEngine 블랙홀', () => {
  it('항성 두 개가 병합하면 그 자리에서 블랙홀이 된다', () => {
    // COLLAPSE_MASS(3000)는 항성 프리셋(2000)보다 크고 둘의 합(4000)보다 작다.
    const e = new SimulationEngine();
    const a = e.spawn({
      position: [0, 0, 0], velocity: [0, 0, 0],
      mass: BODY_PRESETS.star.mass, color: BODY_PRESETS.star.color,
    });
    e.spawn({
      position: [1, 0, 0], velocity: [0, 0, 0],
      mass: BODY_PRESETS.star.mass, color: BODY_PRESETS.star.color,
    });

    e.step(1 / 60);

    expect(e.bodies.count).toBe(1);
    expect(e.isBlackHole(e.bodies.id[0])).toBe(true);
    expect(e.bodies.mass[0]).toBeCloseTo(BODY_PRESETS.star.mass * 2, 6);
    expect(a).not.toBe(-1);
  });

  it('임계 미만의 천체는 그대로 남는다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: COLLAPSE_MASS - 100 });

    e.step(1 / 60);

    expect(e.isBlackHole(id)).toBe(false);
  });

  it('collapseToBlackHole은 질량과 무관하게 블랙홀로 만든다 (치트)', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 500 });

    e.collapseToBlackHole(id);

    expect(e.isBlackHole(id)).toBe(true);
    expect(e.bodies.radius[e.bodies.indexOfId(id)]).toBeCloseTo(schwarzschildRadius(500), 10);
  });

  it('없는 id로 collapseToBlackHole을 불러도 아무 일도 없다', () => {
    const e = new SimulationEngine();
    e.collapseToBlackHole(999);
    expect(e.isBlackHole(999)).toBe(false);
  });

  it('치트로 만든 작은 블랙홀은 스스로 증발해 사라진다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 1 });
    e.collapseToBlackHole(id);

    // 질량 1의 증발 시간은 약 1.67초. 5초를 굴린다.
    for (let i = 0; i < 5 * 60; i++) e.step(1 / 60);

    expect(e.bodies.indexOfId(id)).toBe(-1);
    expect(e.bodies.count).toBe(0);
  });

  it('블랙홀은 ISCO 안의 천체를 궤도 속도와 무관하게 삼킨다', () => {
    const e = new SimulationEngine();
    const bhMass = 5000;
    const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass });
    e.collapseToBlackHole(bh);

    const r = iscoRadius(bhMass) * 0.9;
    const v = Math.sqrt((G * bhMass) / r);
    e.spawn({ position: [r, 0, 0], velocity: [0, 0, v], mass: 1 });

    expect(e.bodies.count).toBe(2);
    e.step(1 / 60);
    expect(e.bodies.count).toBe(1);
  });

  it('ISCO 밖의 천체는 블랙홀 주위를 정상적으로 공전한다 (중력은 그대로다)', () => {
    const e = new SimulationEngine();
    const bhMass = 5000;
    const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass });
    e.collapseToBlackHole(bh);

    const r = 200; // ISCO(=96)보다 한참 밖
    const v = Math.sqrt((G * bhMass) / r);
    const sat = e.spawn({ position: [r, 0, 0], velocity: [0, 0, v], mass: 1e-3 });

    for (let i = 0; i < 10 * 60; i++) e.step(1 / 60);

    const i = e.bodies.indexOfId(sat);
    expect(i).not.toBe(-1); // 살아 있다
    const dist = Math.hypot(e.bodies.posX[i], e.bodies.posY[i], e.bodies.posZ[i]);
    expect(Math.abs(dist - r) / r).toBeLessThan(0.05); // 궤도를 유지한다
  });

  it('블랙홀 상태가 serialize → load 왕복에서 보존된다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 5000 });
    e.collapseToBlackHole(id);

    const e2 = new SimulationEngine();
    e2.load(e.serialize());

    expect(e2.bodies.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(e2.bodies.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('블랙홀이 있어도 결정론이 유지된다', () => {
    const build = () => {
      const e = new SimulationEngine();
      const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 4000 });
      e.collapseToBlackHole(bh);
      e.spawn({ position: [150, 0, 0], velocity: [0, 0, 5], mass: 10 });
      e.spawn({ position: [-120, 0, 40], velocity: [1, 0, -5], mass: 10 });
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
      expect(a.bodies.mass[i]).toBe(b.bodies.mass[i]);
    }
  });
});
```

`engine.test.ts` 상단 import를 확장한다:

```ts
import {
  BODY_PRESETS,
  BodyType,
  COLLAPSE_MASS,
  G,
  iscoRadius,
  MAX_BODIES,
  radiusFromMass,
  schwarzschildRadius,
} from './units';
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test lib/sim/engine.test.ts
```

기대: FAIL — `e.isBlackHole is not a function` 등.

- [ ] **Step 3: 구현 — `lib/sim/engine.ts`**

상단 import에 추가한다:

```ts
import { applyCollapse, applyHawking, collapseAt, isBlackHoleAt } from './blackhole';
```

`setPinned`/`isPinned` 아래에 메서드를 추가한다:

```ts
  /**
   * 신의 손 치트. 질량과 무관하게 즉시 블랙홀로 만든다.
   *
   * 물리적 근거가 없는 유일한 규칙이지만, 호킹 증발이 스스로 벌을 준다 — 작은 블랙홀은
   * 흡수 반경이 거의 0이라 아무것도 못 먹고 순식간에 증발해 사라진다.
   *
   * 질량이 변하지 않으므로 가속도는 그대로 유효하다(accDirty 불필요).
   */
  collapseToBlackHole(id: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    collapseAt(this.bodies, i);
  }

  isBlackHole(id: number): boolean {
    const i = this.bodies.indexOfId(id);
    return i !== -1 && isBlackHoleAt(this.bodies, i);
  }
```

`substep`의 병합 이후 부분을 교체한다. 기존의

```ts
    if (resolveCollisions(this.bodies)) this.accDirty = true;
```

을 아래로 바꾼다:

```ts
    // 순서가 중요하다. 병합이 질량을 바꾸므로 붕괴 검사는 병합 **뒤**에 와야
    // "항성 둘이 합쳐지는 순간 블랙홀이 된다"가 성립한다.
    if (resolveCollisions(this.bodies)) this.accDirty = true;

    // 임계 질량을 넘긴 천체가 스스로 무너진다. 질량은 그대로이므로 가속도에는
    // 영향이 없지만, 반지름이 바뀌므로 다음 충돌 판정이 달라진다.
    applyCollapse(this.bodies);

    // 호킹 증발. 천체가 사라졌을 때만 true를 반환한다 — 질량이 조금 줄어든 것만으로
    // 가속도를 무효화하면 블랙홀이 하나만 있어도 물리 비용이 2배가 된다.
    if (applyHawking(this.bodies, dt)) this.accDirty = true;
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test && pnpm check-types && pnpm lint
```

기대: 95 passed (86 + 신규 9).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/engine.ts lib/sim/engine.test.ts
git commit -m "feat(sim): 엔진에 블랙홀 붕괴와 증발 배선

substep이 병합 직후 자동 붕괴를 검사하고 호킹 증발을 적용한다.
병합이 질량을 바꾸므로 붕괴 검사가 병합 뒤에 와야 '항성 둘이 합쳐지는
순간 블랙홀이 된다'가 성립한다.

치트용 collapseToBlackHole과 조회용 isBlackHole을 노출한다."
```

---

### Task 5: 강착원반 (`components/scene/AccretionDisks.tsx`)

**Files:**
- Create: `components/scene/AccretionDisks.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation()`, `BodyType`, `iscoRadius`, `MAX_BODIES`
- Produces: `<AccretionDisks />` — draw call 1회

**핵심:** **원반의 안쪽 가장자리가 정확히 ISCO다.** 실제 강착원반도 그렇다 — 그 안쪽엔 안정 궤도가 없어 물질이 머물 수 없기 때문이다. 그래서 **원반의 안쪽 테두리가 곧 죽음의 경계선**이며, 장식이 그대로 위험 표시기가 된다.

검은 구는 별도 렌더가 필요 없다 — `Bodies`의 InstancedMesh가 색 `(0,0,0)`으로 이미 그린다. `meshBasicMaterial`은 조명을 받지 않고, 블룸의 휘도 임계값(0.25)에도 걸리지 않아 완전히 검게 남는다.

- [ ] **Step 1: 구현 — `components/scene/AccretionDisks.tsx`**

```tsx
'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { BodyType, iscoRadius, MAX_BODIES } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();

/**
 * 원반의 안쪽/바깥쪽 반지름 (ISCO 배수).
 *
 * 안쪽이 정확히 1.0 = ISCO인 것이 핵심이다. 실제 강착원반의 안쪽 가장자리도 ISCO다 —
 * 그 안쪽에는 안정 궤도가 없어 물질이 머물 수 없기 때문이다. 따라서 이 테두리는
 * 예쁜 장식인 동시에 "여기 넘어오면 삼켜진다"는 경계선 그 자체다.
 */
const INNER = 1.0;
const OUTER = 2.5;

export default function AccretionDisks() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;

    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      // RingGeometry는 XY 평면에 눕는다. 황도면(XZ)으로 돌린다.
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(iscoRadius(b.mass[i]));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }

    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BODIES]} frustumCulled={false}>
      <ringGeometry args={[INNER, OUTER, 64]} />
      {/* 가산 혼합으로 빛나게 하고 블룸을 받는다. depthWrite를 끄지 않으면
          원반이 뒤쪽 천체를 가린다. */}
      <meshBasicMaterial
        color="#ff9d3c"
        side={THREE.DoubleSide}
        transparent
        opacity={0.55}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
```

- [ ] **Step 2: `SpaceCanvas.tsx`에 마운트**

`<PinMarkers />` 아래, `<CameraRig />` 위에 추가하고 import 한다:

```tsx
import AccretionDisks from './AccretionDisks';
```

```tsx
      <Bodies />
      <Trails />
      <PinMarkers />
      <AccretionDisks />
      <CameraRig />
```

- [ ] **Step 3: 검증**

```bash
pnpm test && pnpm check-types && pnpm lint && pnpm build
```

기대: 95 passed, 나머지 전부 통과.

**브라우저 확인은 사람이 해야 한다.** 자동화 환경에서는 화면을 볼 수 없으므로 "원반이 보인다"고 주장하지 말 것. 확인할 것(사람이): 항성 프리셋으로 질량을 5000으로 올려 던지면 검은 구와 주황색 원반이 나타나는가, 원반이 황도면에 누워 있는가(카메라를 돌려 확인), 원반이 뒤쪽 천체를 가리지 않는가.

- [ ] **Step 4: 커밋**

```bash
git add components/scene/AccretionDisks.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 블랙홀 강착원반 추가

원반의 안쪽 가장자리가 정확히 ISCO다 — 실제 강착원반도 그렇다. 그 안쪽엔
안정 궤도가 없어 물질이 머물 수 없기 때문이다. 그래서 이 테두리는 장식인
동시에 '여기 넘어오면 삼켜진다'는 경계선 그 자체가 된다.

단일 InstancedMesh로 draw call 1회. 검은 구는 Bodies가 색 (0,0,0)으로
이미 그리므로 별도 렌더 경로가 필요 없다."
```

---

### Task 6: 신의 손 UI (`components/ui/BodyCard.tsx`)

**Files:**
- Modify: `components/ui/BodyCard.tsx`

**Interfaces:**
- Consumes: `engine.setMass`, `engine.remove`, `engine.collapseToBlackHole`, `engine.isBlackHole`(Task 4), `iscoRadius`, `schwarzschildRadius`, `HAWKING_K`, `COLLAPSE_MASS`(Task 1)
- Produces: 없음 (UI)

**추가할 것 (설계 문서 §7):**
- **질량 슬라이더** — 실시간 편집. 3000을 넘기면 눈앞에서 붕괴한다.
- **삭제 버튼** — 천체를 지우고 선택을 해제한다.
- **블랙홀화 버튼** — 이미 블랙홀이면 숨긴다.
- **블랙홀 정보** — 사건의 지평선, 흡수 반경(ISCO), 증발 예상 시간.

**기존 파일의 구조 (그대로 유지할 것):** `Info` 인터페이스를 100ms 간격 `setInterval`로 폴링하고, `selectedId`가 `null`이면 effect가 곧바로 return한다(React Compiler의 `set-state-in-effect` 규칙 때문). 낙관적 갱신 패턴(`setInfo({ ...info, pinned: !info.pinned })`)이 이미 쓰이고 있으니 그대로 따른다.

- [ ] **Step 1: `Info`에 블랙홀 필드 추가**

```tsx
interface Info {
  mass: number;
  radius: number;
  speed: number;
  pinned: boolean;
  blackHole: boolean;
}
```

폴링 `tick()` 안의 `setInfo` 호출에 한 줄을 추가한다:

```tsx
      setInfo({
        mass: b.mass[i],
        radius: b.radius[i],
        speed: Math.hypot(b.velX[i], b.velY[i], b.velZ[i]),
        pinned: b.pinned[i] === 1,
        blackHole: b.type[i] === BodyType.BLACK_HOLE,
      });
```

- [ ] **Step 2: import 확장**

```tsx
import {
  BodyType,
  COLLAPSE_MASS,
  HAWKING_K,
  iscoRadius,
  schwarzschildRadius,
} from '@/lib/sim/units';
```

`useSimulation()` 구조분해에 `setSelectedId`가 이미 있는지 확인한다(있다).

- [ ] **Step 3: 증발 시간 포맷 헬퍼를 컴포넌트 밖(모듈 스코프)에 추가**

```tsx
/**
 * 호킹 증발까지 남은 시뮬레이션 시간. dM/dt = -K/M² 를 적분하면 t = M³ / (3K).
 * 질량이 조금만 커져도 어마어마해지므로 사람이 읽을 수 있는 단위로 접는다.
 */
function formatEvaporation(mass: number): string {
  const seconds = (mass * mass * mass) / (3 * HAWKING_K);
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}분`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}시간`;
  if (seconds < 86400 * 365) return `${(seconds / 86400).toFixed(1)}일`;
  const years = seconds / (86400 * 365);
  if (years > 1e6) return '사실상 영원';
  return `${years.toFixed(0)}년`;
}
```

- [ ] **Step 4: 카드 본문에 UI 추가**

기존 `<dl>` 블록 안, `속력` 항목 뒤에 블랙홀 전용 항목을 추가한다:

```tsx
        {info.blackHole && (
          <>
            <div className="flex justify-between">
              <dt className="text-slate-400">사건의 지평선</dt>
              <dd>{schwarzschildRadius(info.mass).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-amber-300/70">흡수 반경 (ISCO)</dt>
              <dd className="text-amber-200">{iscoRadius(info.mass).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">증발까지</dt>
              <dd>{formatEvaporation(info.mass)}</dd>
            </div>
          </>
        )}
```

기존 `위치 고정` 버튼 **위에** 질량 슬라이더를 넣는다:

```tsx
      <label className="mt-3 mb-1 block font-mono text-xs text-sky-200/70">
        질량 {info.mass.toFixed(1)}
        {!info.blackHole && info.mass >= COLLAPSE_MASS * 0.9 && (
          <span className="ml-2 text-amber-300">붕괴 임박</span>
        )}
      </label>
      <input
        type="range"
        min={0.1}
        max={10000}
        step={0.1}
        value={info.mass}
        onChange={(e) => {
          const m = Number(e.target.value);
          engine.setMass(selectedId, m);
          setInfo({ ...info, mass: m }); // 100ms 폴링을 기다리지 않고 즉시 반영한다
        }}
        className="mb-2 w-full accent-sky-400"
      />
```

기존 `위치 고정` 버튼 **아래에** 블랙홀화 버튼과 삭제 버튼을 넣는다:

```tsx
      {!info.blackHole && (
        <button
          type="button"
          onClick={() => engine.collapseToBlackHole(selectedId)}
          className="mt-2 w-full rounded bg-violet-500/20 px-2 py-2 text-xs text-violet-100 transition hover:bg-violet-500/40"
        >
          블랙홀화
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          engine.remove(selectedId);
          setSelectedId(null);
        }}
        className="mt-2 w-full rounded bg-rose-500/15 px-2 py-2 text-xs text-rose-100 transition hover:bg-rose-500/40"
      >
        삭제
      </button>
```

블랙홀일 때의 안내 문구를 카드 하단에 추가한다(기존 `pinned` 안내 문구 옆에):

```tsx
      {info.blackHole && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/70">
          원반 안쪽 테두리가 흡수 반경입니다. 그 안으로 들어온 것은
          궤도 속도와 무관하게 삼켜집니다.
        </p>
      )}
```

- [ ] **Step 5: 검증**

```bash
pnpm test && pnpm check-types && pnpm lint && pnpm build
```

기대: 95 passed, 나머지 전부 통과.

**React Compiler 주의:** `pnpm lint`가 `react-hooks/refs`나 `set-state-in-effect`로 불평하면, 규칙을 끄지 말고 구조를 바꿔라(기존 파일이 이미 그런 식으로 정리되어 있다). 무엇을 왜 바꿨는지 보고할 것.

**브라우저 확인은 사람이 해야 한다.** 확인할 것(사람이): 슬라이더로 질량을 3000 위로 올리면 눈앞에서 검게 붕괴하는가, 블랙홀화 버튼이 소행성도 블랙홀로 만드는가(그리고 곧 증발하는가), 삭제가 동작하는가, 블랙홀 카드에 ISCO와 증발 시간이 뜨는가.

- [ ] **Step 6: 커밋**

```bash
git add components/ui/BodyCard.tsx
git commit -m "feat(ui): 신의 손 — 질량 편집, 삭제, 블랙홀화

정보 카드에 질량 슬라이더(3000을 넘기면 눈앞에서 붕괴한다), 삭제 버튼,
블랙홀화 치트 버튼을 붙인다. 블랙홀이면 사건의 지평선·흡수 반경·증발
예상 시간을 함께 보여준다."
```

---

### Task 7: 최종 검증과 문서 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-black-hole-design.md`
- Modify: `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md` (2단계 상태)
- Modify: `README.md`

- [ ] **Step 1: 전체 게이트**

```bash
pnpm test && pnpm check-types && pnpm lint && pnpm build
```

기대: 95 passed, 전부 통과.

- [ ] **Step 2: 사람의 브라우저 확인 (자동화 불가 — 반드시 사람에게 넘길 것)**

```bash
pnpm dev
```

확인 목록:
1. **항성 두 개를 충돌시키면 블랙홀이 되는가.** 스폰 프리셋을 `항성`으로 두고 두 개를 서로에게 던진다. 병합 순간 검게 변하고 주황색 원반이 생겨야 한다.
2. **원반 안쪽 테두리가 죽음의 경계인가.** 블랙홀 주위로 소행성을 던져 본다. 원반 바깥을 지나는 것은 살아서 공전하고, 안쪽 테두리를 넘는 것은 궤도 속도가 있어도 삼켜져야 한다.
3. **폭주 성장이 보이는가.** 무리 소환으로 소행성 200개를 뿌린다. 블랙홀이 먹을수록 원반이 눈에 띄게 커져야 한다.
4. **치트 블랙홀이 스스로 사라지는가.** 소행성을 선택해 `블랙홀화`를 누른다. 몇 초 안에 증발해 사라져야 한다.
5. **먼 궤도는 안전한가.** 블랙홀에서 멀리 떨어진 행성은 아무 일 없이 계속 공전해야 한다 (중력은 항성과 같다).
6. FPS가 무너지지 않는가. 콘솔에 `[sim] 오염된 천체 제거` 경고가 반복되지 않는가.

**숫자 조정이 필요하면** (설계 문서 §11 참고) `C`, `COLLAPSE_MASS`, `HAWKING_K`를 고치고 **설계 문서를 같은 커밋에서 갱신한다.**

- [ ] **Step 3: 설계 문서 갱신**

`docs/superpowers/specs/2026-07-14-black-hole-design.md` 상단 상태 줄을 바꾼다:

```markdown
- 상태: 2단계 구현 완료 (2026-07-14)
```

구현 중 바꾼 숫자가 있으면 §2·§3·§4·§11의 표를 실제 값과 일치시킨다.

`docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`의 §2 로드맵 표에서 2단계 상태를 `이후` → `완료`로 바꾼다.

- [ ] **Step 4: README 갱신**

`README.md`의 조작 표 아래에 한 절을 추가한다:

```markdown
## 블랙홀

질량이 3000을 넘으면 천체는 스스로 붕괴해 블랙홀이 됩니다 — **항성 두 개를 충돌시키면 됩니다.**

블랙홀은 같은 질량의 항성과 **똑같은 중력**을 냅니다. 멀리 있는 행성은 아무 일 없이 계속 공전합니다. 다른 점은 하나뿐입니다: **강착원반의 안쪽 테두리(ISCO) 안으로 들어온 것은 궤도 속도와 무관하게 삼켜집니다.** 뉴턴 중력에서는 아무리 가까워도 빠르기만 하면 궤도를 돌 수 있지만, 실제 블랙홀 근처에는 안정 궤도가 존재하지 않기 때문입니다.

먹을수록 흡수 반경이 **선형으로** 커집니다(`r_s ∝ M`). 일반 천체가 `∛m`으로 굼뜨게 자라는 것과 달라서, 한번 먹기 시작하면 폭주합니다.

천체를 선택해 `블랙홀화`를 누르면 질량과 무관하게 블랙홀로 만들 수 있습니다. 다만 작은 블랙홀은 호킹 복사로 **순식간에 증발합니다** (증발 시간 ∝ M³). 물리가 치트를 알아서 정리합니다.
```

- [ ] **Step 5: 커밋**

```bash
git add docs README.md
git commit -m "docs: 블랙홀 구현 완료 반영 및 README 갱신"
```

---

## 완료 기준

- [ ] `pnpm test` 95개 통과 (블랙홀 공식, 자동 붕괴, 호킹 증발, ISCO 흡수, 병합 규칙, 결정론 포함)
- [ ] `pnpm check-types`, `pnpm lint`, `pnpm build` 통과
- [ ] 항성 두 개를 충돌시키면 블랙홀이 된다
- [ ] 원반 안쪽으로 들어온 천체는 궤도 속도가 있어도 삼켜지고, 바깥은 안전하다
- [ ] 치트로 만든 작은 블랙홀은 스스로 증발해 사라진다
- [ ] 설계 문서와 코드의 숫자가 일치한다
