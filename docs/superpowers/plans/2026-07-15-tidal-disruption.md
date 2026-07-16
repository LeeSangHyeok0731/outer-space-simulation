# 조석 파괴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블랙홀의 조석 반지름 안에 든 천체를 여러 파편(DEBRIS)으로 부수는 조석 파괴를 엔진에 추가한다.

**Architecture:** 순수 함수 `tidalRadius`와 파괴 로직 `resolveTidalDisruption`을 `lib/sim`에 두고, `engine.substep`에서 `resolveCollisions`(ISCO 흡수) 앞에 호출한다. 파편은 새 `BodyType.DEBRIS`라 재분열하지 않아 분열이 유한하다. 찢김 순간 `TIDAL` 이벤트를 내 씬이 섬광을 그린다. 결정론은 난수 없이 고정 패턴으로 지킨다.

**Tech Stack:** 순수 TypeScript 물리 엔진(`lib/sim`, Vitest), React Three Fiber 씬(`components/scene`).

## Global Constraints

- 조석 반지름: `tidalRadius(rBody, mBody, mBH) = TIDAL_STRENGTH · rBody · ∛(mBH/mBody)`, `mBody ≤ 0`이면 `0`.
- `TIDAL_STRENGTH = 5`, `TIDAL_FRAGMENTS = 6`, `BodyType.DEBRIS = 3`, `EventKind.TIDAL = 2`.
- 파괴 조건: 블랙홀의 `r_t > ISCO`(찢을 껍질 존재) **그리고** 천체가 `r_t` 안. 아니면 통째 흡수.
- 파괴 대상은 비-BLACK_HOLE·비-DEBRIS 천체만. **DEBRIS는 다시 파괴되지 않는다**(폭주 방지, 한 천체당 한 번).
- 파편 N개: 질량 `m/N`, 반지름 `radiusFromMass(m/N)`, 위치는 블랙홀→천체 방사선 위에 대칭 배치, 속도는 부모 속도 + 대칭 방사 스프레드 → **질량·운동량 보존**.
- 예산: `count + (N-1) > capacity`면 파괴 건너뜀(부모 유지).
- 서브스텝 순서: `resolveTidalDisruption`을 `resolveCollisions` **앞**에. true 반환이면 `accDirty`.
- 결정론: 난수 금지. 이벤트는 물리에 되먹임 없음.
- 발광은 `toneMapped=false` + Bloom. `AdditiveBlending` 금지(강착원반 유일 예외).
- UI(BodyCard 등) 변경 없음.
- 설계가 바뀌면 코드와 같은 커밋에서 스펙(`docs/superpowers/specs/2026-07-15-tidal-disruption-design.md`)을 갱신.

---

### Task 1: 상수와 조석 반지름 공식

**Files:**
- Modify: `lib/sim/units.ts`
- Test: `lib/sim/units.test.ts`

**Interfaces:**
- Consumes: 기존 `iscoRadius(mass)`, `radiusFromMass(mass)`, `BodyType` (동일 파일).
- Produces: `BodyType.DEBRIS = 3`; `TIDAL_STRENGTH = 5`; `TIDAL_FRAGMENTS = 6`; `tidalRadius(rBody: number, mBody: number, mBH: number): number`.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/sim/units.test.ts` 파일 끝에 추가한다. 상단 import에 `iscoRadius, tidalRadius, TIDAL_STRENGTH`가 없으면 기존 `./units` import 목록에 더한다(실제 import 형태는 파일 상단을 보고 맞춘다).

```ts
describe('tidalRadius', () => {
  it('공식대로 계산한다: TIDAL_STRENGTH · rBody · ∛(mBH/mBody)', () => {
    const expected = TIDAL_STRENGTH * 2 * Math.cbrt(1000 / 8);
    expect(tidalRadius(2, 8, 1000)).toBeCloseTo(expected);
  });

  it('mBH가 클수록 조석 반지름이 크다', () => {
    expect(tidalRadius(2, 8, 5000)).toBeGreaterThan(tidalRadius(2, 8, 1000));
  });

  it('mBody ≤ 0이면 0을 반환한다', () => {
    expect(tidalRadius(2, 0, 1000)).toBe(0);
    expect(tidalRadius(2, -5, 1000)).toBe(0);
  });

  it('전형적 설정에서 조석 반지름이 ISCO보다 바깥이다 (찢을 껍질이 존재)', () => {
    // 질량 3000 블랙홀 + 질량 20 행성(반지름 radiusFromMass(20)).
    const rBody = radiusFromMass(20);
    expect(tidalRadius(rBody, 20, 3000)).toBeGreaterThan(iscoRadius(3000));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: FAIL — `tidalRadius is not a function` / `TIDAL_STRENGTH ... not exported`.

- [ ] **Step 3: 구현**

`lib/sim/units.ts`의 `BodyType`에 `DEBRIS`를 추가한다:

```ts
export const BodyType = {
  NORMAL: 0,
  BLACK_HOLE: 1,
  SHIP: 2,
  DEBRIS: 3,
} as const;
```

그리고 파일 끝(다른 함수 정의들이 모인 곳)에 추가한다:

```ts
/**
 * 조석 파괴 반지름 스케일 계수. 실제 조석 반지름은 이 우주(작은 C로 ISCO가 크다)에서
 * ISCO 안쪽에 묻히므로, C를 재조정했듯 이 계수로 ISCO 바깥의 보이는 띠로 끌어올린다.
 * 시각 조정 대상(스펙 §10).
 */
export const TIDAL_STRENGTH = 5;

/** 조석 파괴 시 생기는 파편 수. 많을수록 극적이나 천체 예산을 더 쓴다(스펙 §10). */
export const TIDAL_FRAGMENTS = 6;

/**
 * 조석 파괴 반지름. `r_t = TIDAL_STRENGTH · R_body · ∛(M_bh / m_body)`
 *
 * 블랙홀의 조석력이 천체의 자체 중력을 이기는 경계다. 이 안쪽에서 천체가 찢어진다.
 * 실제 공식(계수 흡수)을 유지하되 TIDAL_STRENGTH로 스케일만 맞춘다. 밀도가 일정하면
 * R_body ∝ ∛m_body라 질량비가 상쇄되어 사실상 블랙홀 질량에만 의존하는 껍질이 된다.
 * m_body ≤ 0은 0으로 막는다(물리적으로 양수).
 */
export function tidalRadius(rBody: number, mBody: number, mBH: number): number {
  if (mBody <= 0) return 0;
  return TIDAL_STRENGTH * rBody * Math.cbrt(mBH / mBody);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: PASS — 새 4개 케이스 포함 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 조석 파괴 상수와 tidalRadius 공식 추가"
```

---

### Task 2: 조석 파괴 로직 `resolveTidalDisruption`

**Files:**
- Modify: `lib/sim/events.ts`
- Create: `lib/sim/tidal.ts`
- Test: `lib/sim/tidal.test.ts`

**Interfaces:**
- Consumes: `BodyBuffer`(`lib/sim/bodies.ts` — `count`, `capacity`, `type[]`, `mass[]`, `radius[]`, `posX/Y/Z[]`, `velX/Y/Z[]`, `colR/G/B[]`, `add(BodyInit)`, `removeAt(i)`). `EventBuffer`·`EventKind`(`lib/sim/events.ts`). `BodyType`, `iscoRadius`, `radiusFromMass`, `tidalRadius`, `TIDAL_FRAGMENTS`(`lib/sim/units.ts`).
- Produces: `resolveTidalDisruption(b: BodyBuffer, events?: EventBuffer): boolean` — 파괴가 한 번이라도 일어났으면 true.

- [ ] **Step 1: `EventKind.TIDAL` 추가**

`lib/sim/events.ts`의 `EventKind`에 `TIDAL`을 더한다:

```ts
export const EventKind = {
  EVAPORATION: 0,
  MERGE: 1,
  TIDAL: 2,
} as const;
```

- [ ] **Step 2: 실패하는 테스트 작성**

`lib/sim/tidal.test.ts`를 생성한다:

```ts
import { describe, expect, it } from 'vitest';
import { BodyBuffer } from './bodies';
import { EventBuffer, EventKind } from './events';
import { resolveTidalDisruption } from './tidal';
import { BodyType, iscoRadius, radiusFromMass, tidalRadius, TIDAL_FRAGMENTS } from './units';

/** 블랙홀(원점) + 그 조석 띠 안의 일반 천체 하나를 담은 버퍼를 만든다. */
function makeScene(capacity = 64) {
  const b = new BodyBuffer(capacity);
  // 블랙홀: 질량 3000, 반지름은 사건의 지평선. (테스트에선 radius를 직접 준다.)
  b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 3000, radius: 9.6, type: BodyType.BLACK_HOLE });
  return b;
}

describe('resolveTidalDisruption', () => {
  it('조석 띠 안의 천체를 N개 파편(DEBRIS)으로 부순다', () => {
    const b = makeScene();
    const rBody = radiusFromMass(20);
    // ISCO(≈28.8) < 35 < r_t(≈44.7) 이므로 파괴된다.
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 3, vz: 0, mass: 20, radius: rBody, type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(true);

    let debris = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.DEBRIS) debris++;
    expect(debris).toBe(TIDAL_FRAGMENTS);
    // 블랙홀 1 + 파편 N (원래 천체는 제거됨)
    expect(b.count).toBe(1 + TIDAL_FRAGMENTS);
  });

  it('질량과 운동량을 보존한다', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 1, vy: 3, vz: -2, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });

    resolveTidalDisruption(b);

    let m = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.DEBRIS) continue;
      m += b.mass[i];
      px += b.mass[i] * b.velX[i];
      py += b.mass[i] * b.velY[i];
      pz += b.mass[i] * b.velZ[i];
    }
    expect(m).toBeCloseTo(20);
    expect(px).toBeCloseTo(20 * 1);
    expect(py).toBeCloseTo(20 * 3);
    expect(pz).toBeCloseTo(20 * -2);
  });

  it('DEBRIS는 다시 파괴되지 않는다 (폭주 방지)', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
    resolveTidalDisruption(b);
    const after = b.count;

    // 두 번째 호출: 파편은 DEBRIS라 그대로여야 한다.
    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
    expect(b.count).toBe(after);
  });

  it('예산이 부족하면 파괴하지 않는다', () => {
    // capacity 8: 블랙홀 1 + 더미 2 + 천체 1 = 4. 4 + (6-1) = 9 > 8 → 건너뜀.
    const b = new BodyBuffer(8);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 3000, radius: 9.6, type: BodyType.BLACK_HOLE });
    b.add({ x: 500, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3, type: BodyType.NORMAL });
    b.add({ x: 600, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3, type: BodyType.NORMAL });
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
    expect(b.count).toBe(4);
    // 천체는 여전히 NORMAL(파괴 안 됨).
    let normals = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.NORMAL) normals++;
    expect(normals).toBe(3);
  });

  it('r_t ≤ ISCO면 파괴하지 않는다 (통째 흡수 경로)', () => {
    // 아주 큰 블랙홀: ISCO가 r_t보다 크다.
    const b = new BodyBuffer(64);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100000, radius: 320, type: BodyType.BLACK_HOLE });
    const rBody = radiusFromMass(20);
    // r_t < ISCO 임을 전제로 한 시나리오.
    expect(tidalRadius(rBody, 20, 100000)).toBeLessThan(iscoRadius(100000));
    b.add({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: rBody, type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
  });

  it('TIDAL 이벤트를 낸다', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
    const ev = new EventBuffer();

    resolveTidalDisruption(b, ev);

    let tidal = 0;
    for (let k = 0; k < ev.count; k++) if (ev.kind[k] === EventKind.TIDAL) tidal++;
    expect(tidal).toBe(1);
  });

  it('결정론: 같은 입력이면 같은 파편 배치', () => {
    const run = () => {
      const b = makeScene();
      b.add({ x: 35, y: 0, z: 0, vx: 1, vy: 3, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
      resolveTidalDisruption(b);
      const out: number[] = [];
      for (let i = 0; i < b.count; i++) out.push(b.posX[i], b.posY[i], b.posZ[i], b.velX[i], b.velY[i], b.velZ[i]);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm test lib/sim/tidal.test.ts`
Expected: FAIL — `Cannot find module './tidal'` / `resolveTidalDisruption is not a function`.

- [ ] **Step 4: 구현**

`lib/sim/tidal.ts`를 생성한다:

```ts
import type { BodyBuffer } from './bodies';
import { EventKind, type EventBuffer } from './events';
import { BodyType, iscoRadius, radiusFromMass, tidalRadius, TIDAL_FRAGMENTS } from './units';

// 파편 배치·속도 스프레드 조정 상수(스펙 §10). 시각 조정 대상.
const FRAGMENT_SPACING_FACTOR = 1.5; // 파편 간격 = 이 값 × 파편 반지름 (방사 방향)
const FRAGMENT_VEL_SPREAD = 0.6; // 오프셋 단위당 방사 속도 추가분(스트림 신장)

/**
 * 조석 파괴. 블랙홀의 조석 반지름 r_t 안에 든 일반 천체를 N개 파편(DEBRIS)으로 부순다.
 *
 * r_t가 ISCO보다 바깥일 때만(찢을 여지가 있을 때만) 작동한다 — 아니면 통째로 삼켜지도록
 * 둔다. 파편은 DEBRIS라 다시 부서지지 않아 분열은 유한하다. 예산(capacity) 부족이면
 * 건너뛴다. 질량·운동량을 보존한다. 난수를 쓰지 않아 결정론적이다.
 *
 * @returns 파괴가 한 번이라도 일어났으면 true (호출자는 가속도를 다시 계산해야 한다)
 */
export function resolveTidalDisruption(b: BodyBuffer, events?: EventBuffer): boolean {
  const N = TIDAL_FRAGMENTS;
  let changed = false;

  let i = 0;
  while (i < b.count) {
    const t = b.type[i];
    if (t === BodyType.BLACK_HOLE || t === BodyType.DEBRIS) {
      i++;
      continue;
    }

    // 이 천체를 부술 블랙홀을 찾는다(첫 번째로 조건을 만족하는 것).
    let bh = -1;
    for (let j = 0; j < b.count; j++) {
      if (b.type[j] !== BodyType.BLACK_HOLE) continue;
      const rt = tidalRadius(b.radius[i], b.mass[i], b.mass[j]);
      if (rt <= iscoRadius(b.mass[j])) continue; // 찢을 껍질이 없다 — 통째 흡수하도록 둔다
      const dx = b.posX[i] - b.posX[j];
      const dy = b.posY[i] - b.posY[j];
      const dz = b.posZ[i] - b.posZ[j];
      if (dx * dx + dy * dy + dz * dz < rt * rt) {
        bh = j;
        break;
      }
    }

    if (bh === -1) {
      i++;
      continue;
    }

    // 예산: 부모 1개 제거 + 파편 N개 추가 = 순증 N-1. 넘치면 이번엔 건너뛴다.
    if (b.count + (N - 1) > b.capacity) {
      i++;
      continue;
    }

    fragment(b, i, bh, N, events);
    changed = true;
    // i를 증가시키지 않는다: removeAt이 마지막 원소를 i로 옮겼으므로 그 자리를 다시 검사한다.
  }

  return changed;
}

/** i번 천체를 bh번 블랙홀 방향으로 늘어선 N개 파편으로 대체한다. */
function fragment(b: BodyBuffer, i: number, bh: number, N: number, events?: EventBuffer): void {
  // 부모 상태를 먼저 포착한다(removeAt이 i 자리를 덮어쓴다).
  const m = b.mass[i];
  const px = b.posX[i];
  const py = b.posY[i];
  const pz = b.posZ[i];
  const vx = b.velX[i];
  const vy = b.velY[i];
  const vz = b.velZ[i];
  const cr = b.colR[i];
  const cg = b.colG[i];
  const cb = b.colB[i];

  // 블랙홀→천체 방사 단위벡터(바깥 방향).
  let ux = px - b.posX[bh];
  let uy = py - b.posY[bh];
  let uz = pz - b.posZ[bh];
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (len > 1e-9) {
    ux /= len;
    uy /= len;
    uz /= len;
  } else {
    ux = 1; // 퇴화 방어(중심과 정확히 겹침 — 사실상 도달 불가)
    uy = 0;
    uz = 0;
  }

  const mf = m / N;
  const rf = radiusFromMass(mf);
  const spacing = FRAGMENT_SPACING_FACTOR * rf;

  // 부모 제거(마지막 원소가 i 자리로 스왑) 후 파편 N개를 뒤에 붙인다.
  b.removeAt(i);

  for (let k = 0; k < N; k++) {
    const offset = k - (N - 1) / 2; // 대칭: 오프셋 합 0 → 질량중심·운동량 보존
    b.add({
      x: px + ux * offset * spacing,
      y: py + uy * offset * spacing,
      z: pz + uz * offset * spacing,
      vx: vx + ux * offset * FRAGMENT_VEL_SPREAD,
      vy: vy + uy * offset * FRAGMENT_VEL_SPREAD,
      vz: vz + uz * offset * FRAGMENT_VEL_SPREAD,
      mass: mf,
      radius: rf,
      type: BodyType.DEBRIS,
      color: [cr, cg, cb],
    });
  }

  // 찢김 순간 연출용 이벤트(위치=부모 자리, payload=질량). 물리 되먹임 없음.
  events?.push(EventKind.TIDAL, px, py, pz, m);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test lib/sim/tidal.test.ts`
Expected: PASS — 8개 케이스 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add lib/sim/events.ts lib/sim/tidal.ts lib/sim/tidal.test.ts
git commit -m "feat(sim): 조석 파괴 로직 resolveTidalDisruption 추가"
```

---

### Task 3: 엔진 서브스텝에 배선

**Files:**
- Modify: `lib/sim/engine.ts`
- Test: `lib/sim/engine.test.ts` (기존 파일에 describe 추가; 없으면 파일 생성)

**Interfaces:**
- Consumes: `resolveTidalDisruption`(`lib/sim/tidal.ts`), 기존 `SimulationEngine`(`spawn`, `collapseToBlackHole`, `step`, `bodies`).
- Produces: 없음(엔진 내부 동작 변경).

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`lib/sim/engine.test.ts`에 추가한다(파일이 없으면 생성하고 import 포함). 기존 파일이면 상단 import에 맞춰 필요한 심볼만 더한다.

```ts
import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import { BodyType, radiusFromMass } from './units';

describe('조석 파괴 통합', () => {
  it('조석 띠 안의 천체가 스텝 후 여러 DEBRIS로 부서진다', () => {
    const engine = new SimulationEngine();
    // 질량 3000 천체를 스폰해 블랙홀로 만든다(반지름=사건의 지평선).
    const bhId = engine.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 3000 });
    engine.collapseToBlackHole(bhId);
    // ISCO(≈28.8) < 35 < r_t(≈44.7). 접선 속도를 줘 한 스텝에 통째로 빨려들지 않게 한다.
    engine.spawn({ position: [35, 0, 0], velocity: [0, 8, 0], mass: 20 });

    engine.step(1 / 120); // 서브스텝 1회

    let debris = 0;
    let mass = 0;
    for (let i = 0; i < engine.bodies.count; i++) {
      if (engine.bodies.type[i] === BodyType.DEBRIS) {
        debris++;
        mass += engine.bodies.mass[i];
      }
    }
    expect(debris).toBeGreaterThan(1); // 여러 조각으로 부서졌다
    expect(mass).toBeCloseTo(20, 1); // 파편 질량 합 ≈ 원래 질량
  });

  it('파편이 무한 증식하지 않는다 (여러 스텝 후 천체 수 유한)', () => {
    const engine = new SimulationEngine();
    const bhId = engine.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 3000 });
    engine.collapseToBlackHole(bhId);
    engine.spawn({ position: [35, 0, 0], velocity: [0, 8, 0], mass: 20 });

    for (let s = 0; s < 200; s++) engine.step(1 / 120);

    // 파괴는 한 번뿐이고 파편은 결국 흡수되므로 천체 수는 상한(블랙홀 1 + 파편 N) 이하.
    expect(engine.bodies.count).toBeLessThanOrEqual(1 + 6);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test lib/sim/engine.test.ts`
Expected: FAIL — 첫 테스트에서 `debris`가 0(아직 파괴 로직이 substep에 없음)이라 `toBeGreaterThan(1)` 실패.

- [ ] **Step 3: 엔진에 배선**

`lib/sim/engine.ts` 상단 import에 추가한다:

```ts
import { resolveTidalDisruption } from './tidal';
```

`substep`에서 `resolveCollisions` 호출 **바로 앞**에 조석 파괴를 넣는다. 기존:

```ts
    integrate(this.bodies, dt);

    // 순서가 중요하다. 병합이 질량을 바꾸므로 붕괴 검사는 병합 **뒤**에 와야
    // "항성 둘이 합쳐지는 순간 블랙홀이 된다"가 성립한다.
    if (resolveCollisions(this.bodies, this.events)) this.accDirty = true;
```

를 다음으로 바꾼다:

```ts
    integrate(this.bodies, dt);

    // 조석 파괴는 ISCO 흡수보다 **앞**에 온다. 조석 반지름 r_t가 ISCO보다 바깥이라
    // 천체는 공간적으로 r_t에 먼저 닿는다 — 삼켜지기 전에 먼저 찢어져야 한다.
    if (resolveTidalDisruption(this.bodies, this.events)) this.accDirty = true;

    // 순서가 중요하다. 병합이 질량을 바꾸므로 붕괴 검사는 병합 **뒤**에 와야
    // "항성 둘이 합쳐지는 순간 블랙홀이 된다"가 성립한다.
    if (resolveCollisions(this.bodies, this.events)) this.accDirty = true;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test lib/sim/engine.test.ts`
Expected: PASS — 두 테스트 통과.

- [ ] **Step 5: 전체 sim 테스트 통과 확인 (회귀 없음)**

Run: `pnpm test`
Expected: PASS — 기존 테스트 포함 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add lib/sim/engine.ts lib/sim/engine.test.ts
git commit -m "feat(sim): 서브스텝에 조석 파괴 배선"
```

---

### Task 4: 찢김 순간 시각 연출

**Files:**
- Modify: `components/scene/EffectsController.tsx`

**Interfaces:**
- Consumes: 기존 `EventKind`(이제 `TIDAL` 포함), `radiusFromMass`(`@/lib/sim/units`), 기존 `spawn`/`flashes` 풀.
- Produces: 없음(씬 시각).

- [ ] **Step 1: import에 `radiusFromMass` 추가**

`components/scene/EffectsController.tsx`의 units import를 확장한다. 기존:

```ts
import { iscoRadius, schwarzschildRadius } from '@/lib/sim/units';
```
→
```ts
import { iscoRadius, radiusFromMass, schwarzschildRadius } from '@/lib/sim/units';
```

- [ ] **Step 2: TIDAL 이벤트 처리 추가**

이벤트 스폰 루프(`for (let k = 0; k < ev.count; k++) { ... }`)의 `EVAPORATION`/`MERGE` 분기 뒤에 `else if` 가지를 추가한다. 기존 MERGE 분기:

```ts
      } else if (ev.kind[k] === EventKind.MERGE) {
        // 잔여 질량의 ISCO를 잔물결 최종 반경 기준으로 쓴다.
        spawn(ripples.current, ev.x[k], ev.y[k], ev.z[k], iscoRadius(ev.payload[k]) * 3);
      }
```

를 다음으로 바꾼다(가지 하나 추가):

```ts
      } else if (ev.kind[k] === EventKind.MERGE) {
        // 잔여 질량의 ISCO를 잔물결 최종 반경 기준으로 쓴다.
        spawn(ripples.current, ev.x[k], ev.y[k], ev.z[k], iscoRadius(ev.payload[k]) * 3);
      } else if (ev.kind[k] === EventKind.TIDAL) {
        // 찢김 순간 밝은 섬광 버스트. 크기는 부서진 천체 질량에 비례해, 파편 스트림이
        // 실제로 늘어나는 것을 시각적으로 강조한다(증발 섬광보다 크게 보인다).
        const size = Math.max(radiusFromMass(ev.payload[k]), 0.5) * 5;
        spawn(flashes.current, ev.x[k], ev.y[k], ev.z[k], size);
      }
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm check-types`
Expected: PASS.

- [ ] **Step 4: 린트**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: 빌드**

Run: `pnpm build`
Expected: PASS — Compiled successfully.

- [ ] **Step 6: 사람 브라우저 확인 (자동화 불가)**

`pnpm dev`로 띄우고 블랙홀을 만든 뒤 행성을 조석 띠(ISCO 바깥, 그리 멀지 않은 거리)로 던져 확인한다:
- 천체가 여러 파편으로 찢어지고 방사 방향으로 늘어선 스트림으로 보이는가.
- 찢김 순간 밝은 섬광 버스트가 뜨는가(증발 섬광보다 크게).
- 안쪽 파편은 빨려들고(흡수 섬광) 바깥쪽은 튕겨 나가기도 하는가.
- 파편이 무한 증식하지 않고 결국 흡수되어 정리되는가.
- 큰 블랙홀은 천체를 찢지 않고 통째로 삼키는가.

(이 단계는 커밋을 막지 않는다 — 시각 확인은 최종 머지 전 사람이 한다.)

- [ ] **Step 7: 커밋**

```bash
git add components/scene/EffectsController.tsx
git commit -m "feat(scene): 조석 파괴 찢김 섬광 연출 추가"
```

---

### Task 5: 설계 문서 동기화 + 전체 게이트

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-tidal-disruption-design.md`

**Interfaces:**
- Consumes: 없음(문서). Produces: 없음.

- [ ] **Step 1: 상태 줄 갱신**

4번째 줄을 바꾼다:

```
- 상태: 승인됨 (구현 대기)
```
→
```
- 상태: 구현 완료 (2026-07-15)
```

- [ ] **Step 2: §7 연출 서술을 구현에 맞게 조정**

§7의 "짧고 밝은 방사 섬광 줄기" 서술을 실제 구현(방향 없는 밝은 섬광 버스트, 크기는 질량 비례 — 파편 스트림 자체가 늘어남을 보여줌)에 맞게 바꾼다. §7 문단의 첫 문장을 다음으로 교체한다:

```
분열 자리에 `EventKind.TIDAL = 2` 이벤트를 하나 낸다(payload = 질량). `EffectsController`가 읽어 **밝은 섬광 버스트**(크기는 질량 비례)를 그려 찢김 순간을 강조한다 — 방사 방향 스트림은 파편 자체가 늘어서며 만든다.
```

(스펙 §10의 조정 상수 목록에 이미 "파편 퍼짐 폭, 방사 속도 스프레드"가 있으니 그대로 둔다. 구현의 `FRAGMENT_SPACING_FACTOR`·`FRAGMENT_VEL_SPREAD`가 이에 해당한다.)

- [ ] **Step 3: 전체 게이트 실행**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 모두 PASS.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-07-15-tidal-disruption-design.md
git commit -m "docs: 조석 파괴 구현 완료 반영"
```

---

## 실행 후 (계획 밖)

- 브랜치 전체 최종 리뷰(가장 강한 모델). 특히 **엔진 코어 변경**이라 결정론·swap-remove 반복 안전성·예산 경계·서브스텝 순서를 집중 검토.
- 사람 브라우저 시각 확인(스펙 §11 체크리스트) 후 PR 생성 — 머지는 사용자가 한다.
