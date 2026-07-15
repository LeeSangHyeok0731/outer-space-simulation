# 블랙홀 이벤트→효과 파운데이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시뮬레이션의 극적인 물리 사건(호킹 증발 소멸, 블랙홀 쌍성 병합)을 화면에 보이게 만들고, 병합에는 중력파 반동(킥)을 더한다.

**Architecture:** sim→scene 이벤트 큐(`lib/sim/events.ts`)를 파운데이션으로 놓는다. 엔진이 `EventBuffer`를 소유하고 매 스텝 비운 뒤, `applyHawking`/`resolveCollisions`가 소멸·병합 사건을 밀어넣는다. 씬의 새 `EffectsController`가 그 버퍼를 매 프레임 읽어 풀링된 시각효과를 스폰한다. 병합 킥은 이벤트와 무관한 **sim 내부의 결정론적 물리 변화**로, `mergeInto`에서 잔여 블랙홀 속도에 더해진다.

**Tech Stack:** TypeScript(strict), Vitest, Next.js 16, React 19(React Compiler), React Three Fiber 9 + three 0.184, Tailwind v4

**설계 문서:** `docs/superpowers/specs/2026-07-15-blackhole-effects-design.md` — 설계가 바뀌면 코드와 **같은 커밋에서** 이 문서를 갱신한다.

## Global Constraints

- 패키지 매니저는 **pnpm**.
- TypeScript `strict: true`. **`any` 금지, 타입 문제를 피하려는 `as` 단언 금지.**
- `lib/sim/`은 **React도 three.js도 import하지 않는다.** 순수 TS이며 Vitest로 검증한다.
- 천체의 위치·속도·질량은 **React state에 넣지 않는다.** 엔진의 `Float64Array`에만 존재한다. 이벤트 버퍼도 마찬가지로 엔진이 소유하고 씬은 읽기만 한다.
- **`useFrame` 안에서 할당하지 않는다.** 재사용 객체·풀은 모듈 스코프 또는 ref에 둔다.
- `engine.step()`의 유일한 호출자는 `components/scene/Bodies.tsx`다. 새 씬 컴포넌트는 엔진을 **읽기만** 하며 `Bodies` **뒤에** 마운트한다.
- **결정론:** 이벤트는 sim으로 되먹임되지 않는다. 킥은 sim 물리를 바꾸지만 질량·속도의 순수 함수라 결정론적이다. 블랙홀 병합이 있어도 같은 초기조건→같은 결과여야 한다.
- **발광은** `meshBasicMaterial` + `toneMapped={false}` + Bloom으로 한다. **`AdditiveBlending`을 쓰지 않는다** (강착원반이 유일한 예외이며 복사하지 않는다 — `.claude/rules/ui-conventions.md`).
- 커밋은 Conventional Commits + 한국어 본문. 스코프: `sim`(`lib/sim/`), `scene`, `docs`.
- 각 태스크 끝에서 `pnpm test`, `pnpm check-types`, `pnpm lint`가 통과해야 한다. 씬 태스크는 `pnpm build`까지.

## 기존 코드에서 알아야 할 것

- `lib/sim/units.ts` — `G = 1`, `C = 25`, `HAWKING_K = 0.2`, `EVAPORATION_FLOOR = 0.01`, `schwarzschildRadius(mass)`, `iscoRadius(mass)`, `BodyType = { NORMAL: 0, BLACK_HOLE: 1, SHIP: 2 }`, `radiusFromMass`, `MAX_BODIES = 512`.
- `lib/sim/bodies.ts` — `BodyBuffer`(SoA): `posX/posY/posZ`, `velX/velY/velZ`, `mass`, `radius`, `type`, `id`, `colR/colG/colB`, `pinned`, `count`; `removeAt`(**swap-remove**).
- `lib/sim/collisions.ts` — `resolveCollisions(b): boolean`, private `mergeInto(b, i, j)`. 병합은 질량·운동량·부피를 보존하고, 블랙홀이 이기며, **pinned가 이기면 닻 위치 유지·속도 0**.
- `lib/sim/blackhole.ts` — `applyHawking(b, dt): boolean`. 블랙홀을 제거할 때만 `true`. **뒤에서부터 순회**(swap-remove 안전).
- `lib/sim/engine.ts` — `SimulationEngine`. `step(realDt)`가 고정 스텝 누적기로 `substep(dt)`를 돌린다. `substep` 순서: `sanitize → computeAccelerations → integrate → resolveCollisions → applyCollapse → applyHawking → sanitize`.
- `components/scene/AccretionDisks.tsx` — 단일 InstancedMesh 씬 컴포넌트의 참고 패턴(모듈 스코프 `dummy`, `mesh.count = n`, `frustumCulled={false}`).
- `components/scene/SpaceCanvas.tsx` — `<Canvas>` 경계. `Bodies` 뒤에 `AccretionDisks`가 마운트돼 있다.
- 테스트는 현재 **100개**.

**주의(테스트 수 세기):** 계획의 "기대 개수"는 대략치다. 각 태스크 끝에서 실제로 나온 수가 신규 테스트만큼 늘었으면 정상이다. 총합을 하드코딩해 단언하지 말 것.

---

### Task 1: 이벤트 버퍼 (`lib/sim/events.ts`)

sim이 씬에 알리는 일회성 사건을 담는 순수 TS 버퍼. 이 태스크는 이후 모든 태스크의 토대다.

**Files:**
- Create: `lib/sim/events.ts`, `lib/sim/events.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `EventKind = { EVAPORATION: 0, MERGE: 1 }` (const 객체), `EventKindValue` 타입
  - `class EventBuffer` — 생성자 `(capacity = 64)`; 필드 `kind`(Uint8Array), `x`/`y`/`z`/`payload`(Float64Array), `capacity`, `count`; 메서드 `push(kind, x, y, z, payload): void`, `clear(): void`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/events.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { EventBuffer, EventKind } from './events';

describe('EventBuffer', () => {
  it('push하면 count가 늘고 필드가 저장된다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.EVAPORATION, 1, 2, 3, 100);
    expect(e.count).toBe(1);
    expect(e.kind[0]).toBe(EventKind.EVAPORATION);
    expect(e.x[0]).toBe(1);
    expect(e.y[0]).toBe(2);
    expect(e.z[0]).toBe(3);
    expect(e.payload[0]).toBe(100);
  });

  it('clear하면 count가 0이 된다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.MERGE, 0, 0, 0, 1);
    e.clear();
    expect(e.count).toBe(0);
  });

  it('용량을 넘으면 새 이벤트를 조용히 버린다 (시각효과일 뿐)', () => {
    const e = new EventBuffer(2);
    e.push(EventKind.MERGE, 0, 0, 0, 1);
    e.push(EventKind.MERGE, 0, 0, 0, 2);
    e.push(EventKind.MERGE, 0, 0, 0, 3); // 버려짐
    expect(e.count).toBe(2);
    expect(e.payload[0]).toBe(1);
    expect(e.payload[1]).toBe(2);
  });

  it('여러 종류를 섞어 담을 수 있다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.EVAPORATION, 0, 0, 0, 10);
    e.push(EventKind.MERGE, 5, 0, 0, 20);
    expect(e.kind[0]).toBe(EventKind.EVAPORATION);
    expect(e.kind[1]).toBe(EventKind.MERGE);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/events.test.ts`
Expected: FAIL — `Failed to resolve import "./events"`

- [ ] **Step 3: 구현 — `lib/sim/events.ts`**

```ts
/**
 * 시뮬레이션이 씬에 알리는 일회성 사건의 종류.
 * 확장 가능한 enum이다 — 이후 ISCO 흡수 플레어·자동 붕괴 섬광이 여기 붙는다.
 */
export const EventKind = {
  EVAPORATION: 0,
  MERGE: 1,
} as const;

export type EventKindValue = (typeof EventKind)[keyof typeof EventKind];

/**
 * 한 프레임 동안 일어난 사건들을 담는 사전할당 버퍼(SoA).
 *
 * 엔진이 소유하고 매 스텝 시작에서 비운다. 씬이 그 프레임에 한 번 읽어 시각효과를 스폰한다.
 * 이벤트는 시뮬레이션 상태로 **되먹임되지 않는다** — 순수한 알림이라 결정론에 영향이 없다.
 */
export class EventBuffer {
  readonly kind: Uint8Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly payload: Float64Array;
  readonly capacity: number;
  count = 0;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.kind = new Uint8Array(capacity);
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.z = new Float64Array(capacity);
    this.payload = new Float64Array(capacity);
  }

  push(kind: EventKindValue, x: number, y: number, z: number, payload: number): void {
    // 넘치면 조용히 버린다. 한 프레임에 이만큼 사건이 몰리는 일은 드물고,
    // 몇 개 누락돼도 시각효과일 뿐이라 무해하다.
    if (this.count >= this.capacity) return;
    const i = this.count;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.payload[i] = payload;
    this.count++;
  }

  clear(): void {
    this.count = 0;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 4개 포함 전부 통과 (약 104개).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/events.ts lib/sim/events.test.ts
git commit -m "feat(sim): sim→scene 이벤트 버퍼 추가

물리 사건(증발 소멸·병합)을 씬에 알리는 사전할당 SoA 버퍼.
엔진이 소유하고 매 스텝 비운다. 이벤트는 sim으로 되먹임되지 않아 결정론에 영향이 없다."
```

---

### Task 2: 엔진이 이벤트 버퍼를 소유 (`lib/sim/engine.ts`)

엔진에 `events` 버퍼를 달고 매 스텝 시작에서 비운다. 아직 아무도 이벤트를 방출하지 않는다 — 이 태스크는 통로의 소유권과 생명주기만 세운다.

**Files:**
- Modify: `lib/sim/engine.ts`
- Modify: `lib/sim/engine.test.ts`

**Interfaces:**
- Consumes: `EventBuffer`(Task 1)
- Produces: `SimulationEngine.events: EventBuffer` (읽기용 필드)

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/engine.test.ts` 끝에 append**

```ts
describe('SimulationEngine 이벤트 버퍼', () => {
  it('engine.events는 처음에 비어 있다', () => {
    const e = new SimulationEngine();
    expect(e.events.count).toBe(0);
  });

  it('step()은 시작에서 이벤트를 비운다 (일시정지 중에도)', () => {
    // 씬은 매 프레임 이벤트를 읽는다. 비우지 않으면 같은 이벤트가 매 프레임 다시
    // 스폰돼 효과가 무한 반복된다. 일시정지 중에도 새 이벤트가 없으므로 비워야 한다.
    const e = new SimulationEngine();
    e.events.push(EventKind.MERGE, 0, 0, 0, 1);
    e.paused = true;
    e.step(1 / 60);
    expect(e.events.count).toBe(0);
  });
});
```

`engine.test.ts` 상단 import에 추가한다 (기존 import 문 옆). 이 태스크의 테스트는 `EventKind`만 쓰므로 그것만 import한다(미사용 import는 lint 실패):

```ts
import { EventKind } from './events';
```

> 이후 Task 4·5가 같은 파일에 테스트를 더하지만 그것들도 `EventKind`만 쓴다 — import는 그대로 두면 된다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/engine.test.ts`
Expected: FAIL — `e.events`가 undefined.

- [ ] **Step 3: 구현 — `lib/sim/engine.ts`**

상단 import에 추가한다:

```ts
import { EventBuffer } from './events';
```

`SimulationEngine` 클래스에 필드를 추가한다 (`readonly bodies: BodyBuffer;` 아래):

```ts
  /** 이번 프레임의 물리 사건(증발·병합). 씬이 읽어 시각효과를 스폰한다. */
  readonly events = new EventBuffer();
```

`step`의 맨 위에서 이벤트를 비운다. 기존:

```ts
  step(realDt: number): void {
    if (this.paused) return;
```

를 아래로 바꾼다 (clear를 paused 검사 **앞**에 둔다 — 일시정지 중에도 매 프레임 비워야 효과가 무한 반복되지 않는다):

```ts
  step(realDt: number): void {
    // 매 프레임 시작에서 비운다. 이번 프레임의 서브스텝들이 다시 채우고,
    // 씬이 이 프레임에 한 번 읽는다. paused 검사보다 앞에 둬야 일시정지 중
    // 낡은 이벤트가 매 프레임 다시 스폰되지 않는다.
    this.events.clear();

    if (this.paused) return;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 2개 포함 전부 통과 (약 106개).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/engine.ts lib/sim/engine.test.ts
git commit -m "feat(sim): 엔진이 이벤트 버퍼를 소유하고 매 스텝 비운다

step() 시작에서 events.clear()를 부른다(paused보다 앞) — 일시정지 중
낡은 이벤트가 매 프레임 다시 스폰되는 것을 막는다. 아직 방출은 없다."
```

---

### Task 3: 병합 킥 속력 공식 (`lib/sim/units.ts`)

블랙홀 쌍성 병합의 반동 크기를 정하는 순수 함수. 방향은 호출자(Task 4)가 상대속도로 정한다.

**Files:**
- Modify: `lib/sim/units.ts`
- Modify: `lib/sim/units.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `KICK_STRENGTH = 200`
  - `mergeKickSpeed(m1: number, m2: number): number` — 피치트 질량비 법칙

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/units.test.ts` 끝에 append**

```ts
describe('병합 킥 속력 (피치트 질량비 법칙)', () => {
  it('같은 질량이면 킥이 없다 (대칭이라 반동 없음)', () => {
    expect(mergeKickSpeed(1000, 1000)).toBe(0);
  });

  it('비대칭 병합은 킥이 있다', () => {
    expect(mergeKickSpeed(1000, 380)).toBeGreaterThan(0);
  });

  it('적당한 질량비가 극단적 질량비보다 세게 튄다', () => {
    // q²(1−q)/(1+q)⁵ 는 q≈0.38 부근에서 최대다. 같은 질량(q→1)도,
    // 아주 가벼운 쪽(q→0)도 반동이 약하다.
    const moderate = mergeKickSpeed(1000, 380);
    expect(moderate).toBeGreaterThan(mergeKickSpeed(1000, 50)); // 너무 가벼운 쪽
    expect(moderate).toBeGreaterThan(mergeKickSpeed(1000, 950)); // 거의 같은 질량
  });

  it('KICK_STRENGTH에 정비례한다', () => {
    // q = 0.5 → scale = 0.5²·0.5 / 1.5⁵
    const expected = KICK_STRENGTH * ((0.5 * 0.5 * 0.5) / Math.pow(1.5, 5));
    expect(mergeKickSpeed(1000, 500)).toBeCloseTo(expected, 10);
  });
});
```

`units.test.ts` 상단 import에 `KICK_STRENGTH`, `mergeKickSpeed`를 추가한다(기존 import 문에 알파벳 순으로 끼워 넣는다).

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: FAIL — `mergeKickSpeed`, `KICK_STRENGTH`가 `./units`에 없다.

- [ ] **Step 3: 구현 — `lib/sim/units.ts` 끝에 append**

```ts
/**
 * 병합 킥의 세기. 클수록 잔여 블랙홀이 세게 튄다.
 *
 * 조정 가능한 숫자다(설계 문서 §7). 너무 크면 병합 잔여 블랙홀이 화면 밖으로 날아가고,
 * 너무 작으면 반동이 안 보인다. 최종값은 사람이 브라우저에서 맞춘다.
 */
export const KICK_STRENGTH = 200;

/**
 * 블랙홀 쌍성 병합의 중력파 반동(킥) 속력. 피치트(Fitchett) 질량비 법칙:
 *
 *   q = m_light / m_heavy,  v = KICK_STRENGTH · q²(1−q) / (1+q)⁵
 *
 * 정성적 거동이 **실제 물리**다: 같은 질량(q=1)이면 0(대칭이라 반동 없음),
 * 극단적 질량비(q→0)여도 0(시험입자 극한), 그 사이 q≈0.38 부근에서 최대다.
 *
 * 방향은 이 함수가 정하지 않는다 — 호출자가 병합 직전 상대속도로 근사한다(스핀이 없어서).
 */
export function mergeKickSpeed(m1: number, m2: number): number {
  const heavy = Math.max(Math.abs(m1), Math.abs(m2));
  const light = Math.min(Math.abs(m1), Math.abs(m2));
  if (heavy === 0) return 0;
  const q = light / heavy;
  const scale = (q * q * (1 - q)) / Math.pow(1 + q, 5);
  return KICK_STRENGTH * scale;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 4개 포함 전부 통과 (약 110개).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 병합 킥 속력 공식 추가 (피치트 질량비 법칙)

같은 질량이면 0, 극단적 질량비여도 0, 그 사이에서 최대. 이 거동은 실제 물리다.
방향은 호출자가 상대속도로 근사한다(스핀이 없어서)."
```

---

### Task 4: 병합 킥과 MERGE 이벤트 (`lib/sim/collisions.ts`)

`mergeInto`가 블랙홀 쌍성 병합일 때 잔여 블랙홀에 킥을 더하고 MERGE 이벤트를 방출한다.

**Files:**
- Modify: `lib/sim/collisions.ts`
- Modify: `lib/sim/collisions.test.ts`
- Modify: `lib/sim/engine.ts` (substep의 `resolveCollisions` 호출에 `this.events` 전달)
- Modify: `lib/sim/engine.test.ts` (엔진을 통한 MERGE 방출 배선 확인)

**Interfaces:**
- Consumes: `EventBuffer`, `EventKind`(Task 1), `mergeKickSpeed`(Task 3), `SimulationEngine.events`(Task 2)
- Produces: `resolveCollisions(b: BodyBuffer, events?: EventBuffer): boolean` (이벤트 인자는 선택 — 기존 테스트가 안 깨진다)

**동작 규칙:**
- 킥과 MERGE 이벤트는 **블랙홀 둘이 병합할 때만**(BH+BH). 블랙홀이 일반 천체를 삼킬 때는 없다.
- 킥은 운동량 보존 속도 **위에 더한다**(중력파가 운동량을 실어 나르므로 운동량은 깨진다). 방향은 병합 직전 상대속도 방향, 크기는 `mergeKickSpeed`.
- 상대속도는 속도를 덮어쓰기 **전에** 읽는다.
- **pinned가 이기면 킥도 무효**다 — 킥을 pinned 분기 **앞**에 더하고, pinned 분기가 최종적으로 속도를 0으로 덮는다(기존 pinned 로직이 이긴다).
- `events`는 선택 인자다. 없으면 이벤트를 방출하지 않는다(`events?.push(...)`).

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/collisions.test.ts` 끝에 append**

```ts
describe('블랙홀 병합 킥과 MERGE 이벤트', () => {
  it('블랙홀 쌍성 병합은 운동량 보존 속도 위에 킥을 더한다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    // 질량이 다른 두 블랙홀이 서로 스치며 x축으로 상대운동한다.
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    // 순수 운동량 보존 속도 (킥이 없다면 이것)
    const momentumVx = (4000 * 0 + 1000 * 6) / 5000; // = 1.2

    resolveCollisions(b, events);

    expect(b.count).toBe(1);
    // 상대속도가 +x이므로 킥도 +x. 실제 속도는 운동량 속도보다 커야 한다.
    expect(b.velX[0]).toBeGreaterThan(momentumVx);
  });

  it('같은 질량 블랙홀 병합은 킥이 없다 (운동량 속도 그대로)', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    const momentumVx = (4000 * 0 + 4000 * 6) / 8000; // = 3

    resolveCollisions(b, events);

    expect(b.velX[0]).toBeCloseTo(momentumVx, 10); // 킥 0
  });

  it('킥 방향은 병합 직전 상대속도 방향이다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    // 상대속도를 +z로 준다. 킥도 +z여야 한다(x·y는 운동량대로).
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 10, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    const momentumVz = (1000 * 10) / 5000; // = 2

    resolveCollisions(b, events);

    expect(b.velZ[0]).toBeGreaterThan(momentumVz); // +z 킥
    expect(b.velX[0]).toBeCloseTo(0, 10); // 다른 축은 킥 없음
    expect(b.velY[0]).toBeCloseTo(0, 10);
  });

  it('고정된 블랙홀은 킥에도 안 밀린다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1, pinned: true });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b, events);

    expect(b.count).toBe(1);
    expect(b.velX[0]).toBe(0); // pinned가 킥을 이긴다
    expect(b.velY[0]).toBe(0);
    expect(b.velZ[0]).toBe(0);
  });

  it('블랙홀 쌍성 병합은 MERGE 이벤트를 잔여 질량·위치로 방출한다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b, events);

    expect(events.count).toBe(1);
    expect(events.kind[0]).toBe(EventKind.MERGE);
    expect(events.payload[0]).toBeCloseTo(8000, 6); // 잔여 질량
    expect(events.x[0]).toBeCloseTo(1.5, 6); // 질량중심(같은 질량이라 중간)
  });

  it('블랙홀이 일반 천체를 삼킬 때는 킥도 MERGE 이벤트도 없다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5000, radius: 1 });
    collapseAt(b, 0);
    b.add({ x: iscoRadius(5000) * 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 8, mass: 1, radius: 0.3 });

    const momentumVz = (1 * 8) / 5001;

    resolveCollisions(b, events);

    expect(events.count).toBe(0); // MERGE 이벤트 없음
    expect(b.velZ[0]).toBeCloseTo(momentumVz, 10); // 킥 없음(운동량대로)
  });
});
```

`collisions.test.ts` 상단 import를 확장한다. 현재 파일 상단의 import에 다음을 추가한다:

```ts
import { EventBuffer, EventKind } from './events';
```

그리고 `iscoRadius`가 이미 import돼 있는지 확인한다(블랙홀 흡수 테스트에서 이미 쓰고 있으므로 있을 것이다). 없으면 `./units` import에 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/collisions.test.ts`
Expected: FAIL — `resolveCollisions`가 2번째 인자를 받지 않고, 킥·MERGE 이벤트가 없어 위 테스트들이 실패한다.

- [ ] **Step 3: 구현 — `lib/sim/collisions.ts`**

파일 상단 import를 교체한다:

```ts
import type { BodyBuffer } from './bodies';
import { EventKind, type EventBuffer } from './events';
import { BodyType, iscoRadius, mergeKickSpeed, schwarzschildRadius } from './units';
```

`mergeInto` 전체를 아래로 교체한다 (BH 판정을 위로 올리고, 킥을 pinned 앞에 더하고, 끝에서 MERGE 이벤트를 방출한다):

```ts
function mergeInto(b: BodyBuffer, i: number, j: number, events?: EventBuffer): void {
  const m1 = b.mass[i];
  const m2 = b.mass[j];
  const m = m1 + m2;
  const inv = 1 / m;

  const iBH = b.type[i] === BodyType.BLACK_HOLE;
  const jBH = b.type[j] === BodyType.BLACK_HOLE;
  const anyBH = iBH || jBH;
  const bothBH = iBH && jBH;

  const iPinned = b.pinned[i] === 1;
  const jPinned = b.pinned[j] === 1;
  const anyPinned = iPinned || jPinned;

  let vx = (m1 * b.velX[i] + m2 * b.velX[j]) * inv;
  let vy = (m1 * b.velY[i] + m2 * b.velY[j]) * inv;
  let vz = (m1 * b.velZ[i] + m2 * b.velZ[j]) * inv;

  let px = (m1 * b.posX[i] + m2 * b.posX[j]) * inv;
  let py = (m1 * b.posY[i] + m2 * b.posY[j]) * inv;
  let pz = (m1 * b.posZ[i] + m2 * b.posZ[j]) * inv;

  // 블랙홀 쌍성 병합의 중력파 반동(킥). 운동량 보존 속도 위에 더한다 —
  // 중력파가 운동량을 실어 나르므로 잔여 블랙홀은 반동한다(운동량은 깨진다, 그게 맞다).
  // 방향은 병합 직전 상대속도(궤도면 방향)로 근사한다. 스핀이 없어 방향만 근사이고,
  // 크기 법칙(mergeKickSpeed, 피치트)은 근사가 아니라 실제 물리다.
  if (bothBH) {
    const rvx = b.velX[j] - b.velX[i];
    const rvy = b.velY[j] - b.velY[i];
    const rvz = b.velZ[j] - b.velZ[i];
    const rspeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    if (rspeed > 1e-9) {
      const k = mergeKickSpeed(m1, m2) / rspeed; // 정규화 + 크기
      vx += rvx * k;
      vy += rvy * k;
      vz += rvz * k;
    }
  }

  if (anyPinned) {
    // 고정이 이긴다: 킥도 운동량도 무시하고 닻 위치에 속도 0으로 멈춘다.
    const anchor = iPinned && jPinned ? (m2 > m1 ? j : i) : iPinned ? i : j;
    px = b.posX[anchor];
    py = b.posY[anchor];
    pz = b.posZ[anchor];
    vx = 0;
    vy = 0;
    vz = 0;
  }

  const r1 = b.radius[i];
  const r2 = b.radius[j];
  const radius = Math.cbrt(r1 * r1 * r1 + r2 * r2 * r2);

  // 정체성(id·색·타입): 보통은 무거운 쪽이 이기지만, 블랙홀이 있으면 블랙홀이 이긴다.
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
    b.type[i] = BodyType.BLACK_HOLE;
    b.radius[i] = schwarzschildRadius(m);
    b.colR[i] = 0;
    b.colG[i] = 0;
    b.colB[i] = 0;
  } else {
    b.radius[i] = radius;
  }
  b.posX[i] = px;
  b.posY[i] = py;
  b.posZ[i] = pz;
  b.velX[i] = vx;
  b.velY[i] = vy;
  b.velZ[i] = vz;
  b.pinned[i] = anyPinned ? 1 : 0;

  // 블랙홀 쌍성 병합만 잔물결 이벤트를 낸다. 블랙홀이 일반 천체를 삼키는 것은
  // (이후의 ISCO 흡수 플레어로) 별도로 다룬다. 위치는 잔여 블랙홀 자리(pinned면 닻),
  // payload는 잔여 질량(잔물결 크기).
  if (bothBH) {
    events?.push(EventKind.MERGE, px, py, pz, m);
  }
}
```

`resolveCollisions`가 `events`를 받아 `mergeInto`에 넘기도록 고친다. 기존 시그니처와 호출을 아래로 바꾼다:

```ts
export function resolveCollisions(b: BodyBuffer, events?: EventBuffer): boolean {
  let merged = false;

  for (let i = 0; i < b.count; i++) {
    let j = i + 1;
    while (j < b.count) {
      const dx = b.posX[j] - b.posX[i];
      const dy = b.posY[j] - b.posY[i];
      const dz = b.posZ[j] - b.posZ[i];
      const capture = captureDistance(b, i, j);

      if (dx * dx + dy * dy + dz * dz < capture * capture) {
        mergeInto(b, i, j, events);
        b.removeAt(j);
        merged = true;
      } else {
        j++;
      }
    }
  }

  return merged;
}
```

`resolveCollisions`의 JSDoc 한 줄(있다면)은 그대로 두거나, 이벤트 인자를 한 줄 덧붙인다.

- [ ] **Step 4: 엔진 배선 — `lib/sim/engine.ts`**

`substep`의 병합 호출에 `this.events`를 넘긴다. 기존:

```ts
    if (resolveCollisions(this.bodies)) this.accDirty = true;
```

를 아래로 바꾼다:

```ts
    if (resolveCollisions(this.bodies, this.events)) this.accDirty = true;
```

- [ ] **Step 5: 엔진 배선 테스트 — `lib/sim/engine.test.ts`의 `SimulationEngine 이벤트 버퍼` describe에 append**

```ts
  it('블랙홀 쌍성 병합이 step()을 통해 MERGE 이벤트를 낸다', () => {
    const e = new SimulationEngine();
    const a = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 4000 });
    const b2 = e.spawn({ position: [3, 0, 0], velocity: [0, 0, 0], mass: 4000 });
    e.collapseToBlackHole(a);
    e.collapseToBlackHole(b2);

    e.step(1 / 60);

    expect(e.bodies.count).toBe(1);
    expect(e.events.count).toBe(1);
    expect(e.events.kind[0]).toBe(EventKind.MERGE);
  });
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 7개 포함 전부 통과 (약 117개). **기존 collisions 테스트가 깨지지 않아야 한다** — `events`가 선택 인자라 기존 `resolveCollisions(b)` 호출은 그대로 컴파일된다.

- [ ] **Step 7: 커밋**

```bash
git add lib/sim/collisions.ts lib/sim/collisions.test.ts lib/sim/engine.ts lib/sim/engine.test.ts
git commit -m "feat(sim): 블랙홀 쌍성 병합에 킥과 MERGE 이벤트 추가

블랙홀 둘이 병합하면 잔여 블랙홀이 상대속도 방향으로 반동한다(크기는 피치트
법칙, 운동량 위에 더해져 운동량을 깬다 — 중력파가 실어 나른 것이다). 고정된
블랙홀은 킥에도 안 밀린다. 병합 지점에 MERGE 이벤트를 방출한다."
```

---

### Task 5: EVAPORATION 이벤트 (`lib/sim/blackhole.ts`)

`applyHawking`이 블랙홀을 제거할 때 그 자리에 EVAPORATION 이벤트를 남긴다.

**Files:**
- Modify: `lib/sim/blackhole.ts`
- Modify: `lib/sim/blackhole.test.ts`
- Modify: `lib/sim/engine.ts` (substep의 `applyHawking` 호출에 `this.events` 전달)
- Modify: `lib/sim/engine.test.ts` (증발 이벤트 배선 + 킥 포함 결정론)

**Interfaces:**
- Consumes: `EventBuffer`, `EventKind`(Task 1), `SimulationEngine.events`(Task 2)
- Produces: `applyHawking(b: BodyBuffer, dt: number, events?: EventBuffer): boolean` (이벤트 인자는 선택)

**동작 규칙:**
- 블랙홀을 제거할 때(`next <= EVAPORATION_FLOOR`)만 EVAPORATION 이벤트. 위치는 **제거 직전** 좌표(swap-remove가 덮어쓰기 전에 읽는다), payload는 소멸 직전 질량 `m`.
- `events`는 선택 인자다. 반환값 계약(제거됐을 때만 `true`)은 그대로다.

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/blackhole.test.ts`의 `applyHawking` describe에 append**

```ts
  it('블랙홀이 소멸할 때 EVAPORATION 이벤트를 위치·질량과 함께 낸다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add(make({ x: 7, y: -3, z: 2, mass: 0.02, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1, events)).toBe(true);
    expect(b.count).toBe(0);
    expect(events.count).toBe(1);
    expect(events.kind[0]).toBe(EventKind.EVAPORATION);
    expect(events.x[0]).toBe(7);
    expect(events.y[0]).toBe(-3);
    expect(events.z[0]).toBe(2);
    expect(events.payload[0]).toBeCloseTo(0.02, 10); // 소멸 직전 질량
  });

  it('질량이 줄기만 할 때는 이벤트를 내지 않는다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1, events);

    expect(b.count).toBe(1);
    expect(events.count).toBe(0);
  });
```

`blackhole.test.ts` 상단 import에 추가한다:

```ts
import { EventBuffer, EventKind } from './events';
```

> 참고: `make`는 이 테스트 파일에 이미 있는 헬퍼다(`x/y/z` 기본값 0). 위 첫 테스트는 `x/y/z`를 넘겨 위치를 지정한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/blackhole.test.ts`
Expected: FAIL — `applyHawking`이 3번째 인자를 받지 않고 이벤트를 내지 않는다.

- [ ] **Step 3: 구현 — `lib/sim/blackhole.ts`**

상단 import에 추가한다:

```ts
import { EventKind, type EventBuffer } from './events';
```

`applyHawking`을 아래로 교체한다(시그니처에 `events?` 추가, 제거 직전에 이벤트 방출):

```ts
export function applyHawking(b: BodyBuffer, dt: number, events?: EventBuffer): boolean {
  let removed = false;

  // 뒤에서부터 도는 이유: removeAt은 swap-remove라 마지막 원소를 빈자리로 옮긴다.
  // 앞에서부터 돌면 방금 옮겨온 원소를 건너뛰게 된다.
  for (let i = b.count - 1; i >= 0; i--) {
    if (b.type[i] !== BodyType.BLACK_HOLE) continue;

    const m = b.mass[i];
    const next = m - (HAWKING_K / (m * m)) * dt;

    if (next <= EVAPORATION_FLOOR) {
      // 위치는 removeAt이 덮어쓰기 전에 읽는다. payload는 소멸 직전 질량(섬광 크기).
      events?.push(EventKind.EVAPORATION, b.posX[i], b.posY[i], b.posZ[i], m);
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

- [ ] **Step 4: 엔진 배선 — `lib/sim/engine.ts`**

`substep`의 호킹 호출에 `this.events`를 넘긴다. 기존:

```ts
    if (applyHawking(this.bodies, dt)) this.accDirty = true;
```

를 아래로 바꾼다:

```ts
    if (applyHawking(this.bodies, dt, this.events)) this.accDirty = true;
```

- [ ] **Step 5: 엔진 배선 + 결정론 테스트 — `lib/sim/engine.test.ts`의 `SimulationEngine 이벤트 버퍼` describe에 append**

```ts
  it('치트 블랙홀 증발이 step()을 통해 EVAPORATION 이벤트를 낸다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [10, 0, 0], velocity: [0, 0, 0], mass: 1 });
    e.collapseToBlackHole(id);

    // 질량 1의 증발 시간은 약 1.67초. 소멸할 때까지 굴린다.
    let sawEvaporation = false;
    for (let i = 0; i < 5 * 60 && e.bodies.count > 0; i++) {
      e.step(1 / 60);
      for (let k = 0; k < e.events.count; k++) {
        if (e.events.kind[k] === EventKind.EVAPORATION) sawEvaporation = true;
      }
    }

    expect(e.bodies.count).toBe(0);
    expect(sawEvaporation).toBe(true);
  });

  it('킥과 이벤트가 있어도 결정론이 유지된다', () => {
    const build = () => {
      const e = new SimulationEngine();
      const a = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 4000 });
      const c = e.spawn({ position: [40, 0, 0], velocity: [0, 0, 6], mass: 1200 });
      e.collapseToBlackHole(a);
      e.collapseToBlackHole(c);
      e.spawn({ position: [-150, 0, 30], velocity: [1, 0, -4], mass: 10 });
      return e;
    };
    const a = build();
    const b = build();

    for (let i = 0; i < 400; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }

    expect(a.bodies.count).toBe(b.bodies.count);
    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posX[i]).toBe(b.bodies.posX[i]);
      expect(a.bodies.velX[i]).toBe(b.bodies.velX[i]);
      expect(a.bodies.mass[i]).toBe(b.bodies.mass[i]);
    }
  });
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 4개 포함 전부 통과 (약 121개). 기존 `applyHawking(b, dt)` 호출은 `events`가 선택이라 안 깨진다.

- [ ] **Step 7: 커밋**

```bash
git add lib/sim/blackhole.ts lib/sim/blackhole.test.ts lib/sim/engine.ts lib/sim/engine.test.ts
git commit -m "feat(sim): 블랙홀 증발 소멸에 EVAPORATION 이벤트 추가

applyHawking이 블랙홀을 제거할 때 그 자리에 소멸 직전 질량과 함께 이벤트를
남긴다. 위치는 swap-remove가 덮어쓰기 전에 읽는다. 킥·이벤트가 있어도
결정론이 유지됨을 테스트로 확인한다."
```

---

### Task 6: 시각효과 컴포넌트 (`components/scene/EffectsController.tsx`)

엔진 이벤트를 읽어 풀링된 시각효과(증발 섬광, 병합 잔물결)를 그린다.

**Files:**
- Create: `components/scene/EffectsController.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation()`, `SimulationEngine.events`(Task 2), `EventKind`(Task 1), `iscoRadius`·`schwarzschildRadius`(units)
- Produces: `<EffectsController />` — 섬광용 InstancedMesh 1 + 잔물결용 InstancedMesh 1

**규칙:**
- **useFrame 안에서 할당하지 않는다.** `dummy`·`color`는 모듈 스코프, 풀은 ref. 풀 슬롯 재사용.
- `Bodies` **뒤에** 마운트(같은 프레임 이벤트를 본다). 엔진을 읽기만 한다.
- 발광은 `toneMapped={false}` + Bloom. **`AdditiveBlending` 안 씀.** 페이드는 인스턴스 색을 밝음→어둠으로 낮춰서, 섬광은 sin 포락선으로 크기가 0→최대→0이 되어 깨끗이 사라지게 한다.

- [ ] **Step 1: 구현 — `components/scene/EffectsController.tsx`**

```tsx
'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { EventKind } from '@/lib/sim/events';
import { iscoRadius, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

const MAX_EFFECTS = 32; // 동시에 살아 있는 효과 수 상한(풀 크기)
const FLASH_DURATION = 0.5; // 초
const RIPPLE_DURATION = 1.0; // 초

interface Effect {
  x: number;
  y: number;
  z: number;
  age: number;
  scale: number; // payload에서 정한 기준 크기
  active: boolean;
}

function makePool(): Effect[] {
  return Array.from({ length: MAX_EFFECTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    scale: 0,
    active: false,
  }));
}

function spawn(pool: Effect[], x: number, y: number, z: number, scale: number): void {
  const slot = pool.find((e) => !e.active);
  if (!slot) return; // 풀이 가득 차면 이번 효과는 버린다
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.scale = scale;
  slot.age = 0;
  slot.active = true;
}

/**
 * 물리 이벤트(증발 소멸, 블랙홀 병합)를 시각효과로 그린다.
 *
 * 엔진의 이벤트 버퍼를 매 프레임 읽어 풀에 스폰하고, 각 효과는 스스로 나이 들어 사라진다.
 * Bodies 뒤에 마운트해야 같은 프레임의 이벤트를 본다. 엔진을 읽기만 한다.
 *
 * 발광은 toneMapped=false + Bloom(강착원반과 달리 AdditiveBlending을 쓰지 않는다).
 * 섬광은 sin 포락선으로 크기가 0→최대→0이 되어 깨끗이 사라진다.
 */
export default function EffectsController() {
  const { engine } = useSimulation();
  const flashRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.InstancedMesh>(null);
  const flashes = useRef<Effect[]>(makePool());
  const ripples = useRef<Effect[]>(makePool());

  useFrame((_, delta) => {
    const flashMesh = flashRef.current;
    const rippleMesh = rippleRef.current;
    if (!flashMesh || !rippleMesh) return;

    // 1) 이번 프레임의 이벤트를 풀에 스폰한다.
    const ev = engine.events;
    for (let k = 0; k < ev.count; k++) {
      if (ev.kind[k] === EventKind.EVAPORATION) {
        // 소멸 직전 질량이 클수록 큰 섬광. 사건의 지평선을 기준 크기로 쓴다(최소 보장).
        const size = Math.max(schwarzschildRadius(ev.payload[k]), 0.5) * 4;
        spawn(flashes.current, ev.x[k], ev.y[k], ev.z[k], size);
      } else if (ev.kind[k] === EventKind.MERGE) {
        // 잔여 질량의 ISCO를 잔물결 최종 반경 기준으로 쓴다.
        spawn(ripples.current, ev.x[k], ev.y[k], ev.z[k], iscoRadius(ev.payload[k]) * 3);
      }
    }

    // 2) 섬광: sin 포락선으로 커졌다 사라지고, 색이 밝음→어둠으로 식는다.
    let n = 0;
    for (const f of flashes.current) {
      if (!f.active) continue;
      f.age += delta;
      const t = f.age / FLASH_DURATION;
      if (t >= 1) {
        f.active = false;
        continue;
      }
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(f.scale * Math.sin(t * Math.PI), 1e-4));
      dummy.updateMatrix();
      flashMesh.setMatrixAt(n, dummy.matrix);
      const glow = (1 - t) * 3; // 1을 넘겨 블룸을 받게 한다
      color.setRGB(glow, glow * 0.95, glow * 0.8);
      flashMesh.setColorAt(n, color);
      n++;
    }
    flashMesh.count = n;
    flashMesh.visible = n > 0;
    flashMesh.instanceMatrix.needsUpdate = true;
    if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;

    // 3) 잔물결: 반경이 0→최종으로 퍼지고 색이 식는다.
    let m = 0;
    for (const r of ripples.current) {
      if (!r.active) continue;
      r.age += delta;
      const t = r.age / RIPPLE_DURATION;
      if (t >= 1) {
        r.active = false;
        continue;
      }
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0); // 황도면(XZ)에 눕힌다
      dummy.scale.setScalar(Math.max(r.scale * t, 1e-4));
      dummy.updateMatrix();
      rippleMesh.setMatrixAt(m, dummy.matrix);
      const glow = (1 - t) * (1 - t) * 2.5; // 빨리 식는다
      color.setRGB(glow, glow * 0.8, glow * 0.5);
      rippleMesh.setColorAt(m, color);
      m++;
    }
    rippleMesh.count = m;
    rippleMesh.visible = m > 0;
    rippleMesh.instanceMatrix.needsUpdate = true;
    if (rippleMesh.instanceColor) rippleMesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={flashRef} args={[undefined, undefined, MAX_EFFECTS]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rippleRef} args={[undefined, undefined, MAX_EFFECTS]} frustumCulled={false}>
        <ringGeometry args={[0.85, 1.0, 48]} />
        <meshBasicMaterial
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
```

> `setColorAt`은 `InstancedMesh.instanceColor`가 없으면 처음 호출 때 만들어 준다. `meshBasicMaterial`은 인스턴스 색을 자동으로 확산색에 곱한다 — `vertexColors` 프롭이 필요 없다.

- [ ] **Step 2: 마운트 — `components/scene/SpaceCanvas.tsx`**

import를 추가한다(기존 씬 import 옆, 알파벳 순):

```tsx
import EffectsController from './EffectsController';
```

`<AccretionDisks />` 아래, `<CameraRig />` 위에 추가한다:

```tsx
      <AccretionDisks />
      <EffectsController />
      <CameraRig />
```

- [ ] **Step 3: 검증**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 테스트는 Task 5의 수 그대로(이 태스크는 Vitest 테스트를 추가하지 않는다), 나머지 전부 통과.

**브라우저 확인은 사람이 해야 한다.** 자동화 환경에서는 화면을 볼 수 없으므로 "효과가 보인다"고 주장하지 말 것. 확인할 것(사람이):
1. 작은 블랙홀(치트로 소행성 블랙홀화)이 증발해 사라질 때 섬광이 터지는가.
2. 블랙홀 둘을 병합시키면 잔여 블랙홀이 튕기고 잔물결이 퍼지는가. 같은 질량 둘은 안 튀고, 적당히 다른 질량이 가장 세게 튀는가.
3. 효과가 뒤쪽 천체를 부자연스럽게 가리지 않는가. FPS가 무너지지 않는가.
4. `KICK_STRENGTH`(units.ts, 현재 200)가 적절한가 — 잔여 블랙홀이 화면 밖으로 사라지면 줄이고, 반동이 안 보이면 키운다. **바꾸면 설계 문서 §7을 같은 커밋에서 갱신한다.**
5. 발광이 약하면(AdditiveBlending 없이) 설계 문서 §5의 예고대로 조정을 검토한다 — 필요하면 강착원반처럼 예외로 승격하고 `ui-conventions.md`를 갱신하되, 그건 사람이 보고 결정한다.

- [ ] **Step 4: 커밋**

```bash
git add components/scene/EffectsController.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 증발 섬광과 병합 잔물결 시각효과 추가

엔진 이벤트 버퍼를 매 프레임 읽어 풀링된 효과를 스폰한다. 섬광은 sin 포락선으로
커졌다 사라지고, 잔물결은 잔여 질량의 ISCO까지 퍼진다. 발광은 toneMapped=false +
Bloom(AdditiveBlending 없이). Bodies 뒤에 마운트해 같은 프레임 이벤트를 본다."
```

---

### Task 7: 문서 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-blackhole-effects-design.md`

- [ ] **Step 1: 전체 게이트**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 전부 통과.

- [ ] **Step 2: 설계 문서 상태 갱신**

`docs/superpowers/specs/2026-07-15-blackhole-effects-design.md` 상단 상태 줄을 바꾼다:

```markdown
- 상태: 구현 완료 (2026-07-15)
```

구현 중 `KICK_STRENGTH`나 효과 지속 시간 등 §7의 숫자를 바꿨다면 문서의 값을 실제 값과 일치시킨다.

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-07-15-blackhole-effects-design.md
git commit -m "docs: 블랙홀 이벤트→효과 구현 완료 반영"
```

---

## 완료 기준

- [ ] `pnpm test` 통과 (이벤트 버퍼, 킥 공식, 병합 킥·MERGE 이벤트, EVAPORATION 이벤트, 킥 포함 결정론 포함) — 기준 100개 + 신규 약 21개
- [ ] `pnpm check-types`, `pnpm lint`, `pnpm build` 통과
- [ ] 블랙홀 둘을 병합시키면 잔여 블랙홀이 반동한다(같은 질량은 안 튀고, 적당히 다른 질량이 가장 세게 튄다)
- [ ] 작은 블랙홀이 증발할 때 섬광이 터진다
- [ ] 블랙홀이 있어도 결정론이 유지된다
- [ ] 설계 문서와 코드의 숫자가 일치한다
