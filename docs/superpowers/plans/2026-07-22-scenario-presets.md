# 시나리오 프리셋 · 세이브/로드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로드맵 3단계 — 프리셋 시나리오 4종을 버튼으로 불러오고, 현재 우주를 localStorage 이름 목록 + JSON 파일로 저장/복원한다.

**Architecture:** 관심사 3분리(A안). 프리셋 생성은 순수 물리(`lib/sim/scenes.ts`), 영속화는 브라우저 API·검증(`lib/saves.ts`, `Storage` 주입으로 테스트), UI는 `components/ui/ScenePanel.tsx`. 엔진의 기존 `serialize()`/`load()`/`spawn()`/`collapseToBlackHole()`만 재사용하며 엔진 물리는 건드리지 않는다.

**Tech Stack:** TypeScript, Vitest, Next.js 16 App Router, React 19(react-compiler), React Three Fiber, Tailwind 4.

## Global Constraints

- `lib/sim/`과 `lib/saves.ts`는 React·three·브라우저 전역(`window`/`document`)을 import·사용하지 않는다. `lib/saves.ts`는 `Storage`를 **인자로 주입**받는다(테스트 가능성). — `AGENTS.md`, `.claude/rules/frontend-architecture.md`
- `lib/sim`은 `Math.random`을 직접 부르지 않는다 — 난수는 인자로 주입한다. — `state/SimulationProvider.tsx`의 `scatter` 패턴
- 시뮬레이션 상태(위치·속도·질량 등)는 `useState`에 넣지 않는다. `saves` 목록·UI 토글만 React state다. — `.claude/rules/frontend-architecture.md`
- `setState`를 `useFrame`·`useEffect` 본문에서 동기 호출하지 않는다(react-compiler `set-state-in-effect`). `saves` 상태는 **이벤트 핸들러에서만** 갱신한다. — `.claude/rules/frontend-architecture.md`
- DOM 오버레이 톤: `bg-slate-950/80`, `border-sky-400/30`, `backdrop-blur`, `rounded-lg`, `font-mono text-xs`, 라벨 `uppercase tracking-widest text-sky-300`. 패널은 `pointer-events-auto`. — `.claude/rules/ui-conventions.md`
- Import는 `@/` 별칭(레포 루트)으로. `lib/` 내부 파일끼리는 기존처럼 상대경로(`./sim/engine`). — `.claude/rules/frontend-architecture.md`
- Conventional Commit(한국어 본문). 예: `feat(scenes): ...`, `feat(saves): ...`, `feat(ui): ...`.

---

### Task 1: 프리셋 레지스트리 (`lib/sim/scenes.ts`)

**Files:**
- Modify: `lib/sim/scenes.ts`
- Test: `lib/sim/scenes.test.ts`

**Interfaces:**
- Consumes: `SimulationEngine`(`./engine`)의 `reset()`, `spawn(SpawnOptions): number`, `collapseToBlackHole(id)`, `bodies`(`BodyBuffer`). `BODY_PRESETS`, `BodyType`, `G`(`./units`).
- Produces:
  - `interface ScenePreset { key: string; label: string; description: string; build(engine: SimulationEngine, rng: () => number): void; }`
  - `const SCENE_PRESETS: readonly ScenePreset[]` — key: `'solar' | 'binary' | 'blackhole' | 'collision'` 순서.
  - `function applyPreset(engine: SimulationEngine, key: string, rng: () => number): void` — 없는 key면 무시(no-op).
  - `function createStarterSystem(engine: SimulationEngine): void` — 유지(시그니처 불변). 내부에서 solar build 호출.

- [ ] **Step 1: 실패하는 테스트 작성** — `lib/sim/scenes.test.ts`의 기존 `describe('createStarterSystem')` 블록은 그대로 두고, 파일 상단 import에 `SCENE_PRESETS, applyPreset`를 추가하고 아래 블록을 파일 끝에 덧붙인다.

```ts
import { SCENE_PRESETS, applyPreset } from './scenes';
import { BodyType } from './units';

const RNG = () => 0.5; // 결정론적 난수

describe('SCENE_PRESETS', () => {
  it('solar/binary/blackhole/collision 4종을 이 순서로 노출한다', () => {
    expect(SCENE_PRESETS.map((p) => p.key)).toEqual([
      'solar',
      'binary',
      'blackhole',
      'collision',
    ]);
  });

  it('모든 프리셋은 유한한 천체만 만든다 (NaN/Infinity 없음)', () => {
    for (const preset of SCENE_PRESETS) {
      const engine = new SimulationEngine();
      preset.build(engine, RNG);
      const b = engine.bodies;
      expect(b.count).toBeGreaterThan(0);
      for (let i = 0; i < b.count; i++) {
        for (const arr of [b.posX, b.posY, b.posZ, b.velX, b.velY, b.velZ, b.mass, b.radius]) {
          expect(Number.isFinite(arr[i])).toBe(true);
        }
      }
    }
  });

  it('기대하는 천체 수를 만든다', () => {
    const counts: Record<string, number> = {
      solar: 64,
      binary: 4,
      blackhole: 33,
      collision: 6,
    };
    for (const preset of SCENE_PRESETS) {
      const engine = new SimulationEngine();
      preset.build(engine, RNG);
      expect(engine.bodies.count).toBe(counts[preset.key]);
    }
  });

  it('blackhole 프리셋은 블랙홀을 정확히 1개 만든다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'blackhole', RNG);
    const b = engine.bodies;
    let holes = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.BLACK_HOLE) holes++;
    expect(holes).toBe(1);
  });

  it('collision 프리셋은 시작 시 블랙홀이 없다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'collision', RNG);
    const b = engine.bodies;
    for (let i = 0; i < b.count; i++) expect(b.type[i]).not.toBe(BodyType.BLACK_HOLE);
  });

  it('applyPreset는 없는 key를 안전하게 무시한다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'nope', RNG);
    expect(engine.bodies.count).toBe(0);
  });

  it('createStarterSystem은 solar 프리셋과 같은 천체 수를 낸다', () => {
    const a = new SimulationEngine();
    createStarterSystem(a);
    const bEng = new SimulationEngine();
    applyPreset(bEng, 'solar', RNG);
    expect(a.bodies.count).toBe(bEng.bodies.count);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `pnpm test scenes` / Expected: FAIL (`SCENE_PRESETS`·`applyPreset` export 없음).

- [ ] **Step 3: `lib/sim/scenes.ts` 전체를 아래로 교체**

```ts
import type { SimulationEngine } from './engine';
import { BODY_PRESETS, BodyType, G } from './units';

/** 중심 질량 M 주위 반지름 r에서 XZ 평면 원궤도를 도는 속도 */
function circularVelocity(M: number, r: number): [number, number, number] {
  const v = Math.sqrt((G * M) / r);
  return [0, 0, v];
}

/** 안정된 태양계: 항성 1 + 행성 3 + 소행성 띠 60. '망가뜨릴' 기본 캔버스. */
function buildSolar(engine: SimulationEngine): void {
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

/** 쌍성계: 비슷한 두 항성이 공통 무게중심을 공전 + 바깥 궤도 행성 둘. */
function buildBinary(engine: SimulationEngine): void {
  engine.reset();

  const m = 1500; // 붕괴 임계(3000) 아래 → 항성 유지
  const d = 80;
  // 두 등질량 별이 반지름 d/2로 무게중심을 원운동: v = √(G·m / 2d)
  const v = Math.sqrt((G * m) / (2 * d));
  engine.spawn({ position: [-d / 2, 0, 0], velocity: [0, 0, v], mass: m, color: BODY_PRESETS.star.color });
  engine.spawn({ position: [d / 2, 0, 0], velocity: [0, 0, -v], mass: m, color: BODY_PRESETS.star.color });

  // 바깥 행성은 총질량 2m을 도는 것으로 근사
  const total = 2 * m;
  for (const r of [220, 300]) {
    engine.spawn({
      position: [r, 0, 0],
      velocity: circularVelocity(total, r),
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }
}

/** 블랙홀 + 강착원반: 중앙 블랙홀 주위 공전 링 4개(안쪽 링은 ISCO 안이라 빨려든다). */
function buildBlackHole(engine: SimulationEngine, rng: () => number): void {
  engine.reset();

  const bhMass = 5000; // r_s=16, ISCO=48
  const id = engine.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass, color: [0, 0, 0] });
  engine.collapseToBlackHole(id);

  const rings = [45, 70, 100, 140]; // 45는 ISCO(48) 안쪽 → 즉시 흡수, 70은 조석 파괴대
  const perRing = 8;
  for (const r of rings) {
    const v = Math.sqrt((G * bhMass) / r);
    for (let i = 0; i < perRing; i++) {
      const angle = (i / perRing) * Math.PI * 2 + rng() * 0.2; // 살짝 흐트러 대칭 깨기
      engine.spawn({
        position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
        velocity: [-Math.sin(angle) * v, 0, Math.cos(angle) * v],
        mass: BODY_PRESETS.asteroid.mass,
        color: BODY_PRESETS.asteroid.color,
      });
    }
  }
}

/** 충돌 코스: 두 계가 서로를 향해 접근 → 충돌·병합(질량 충분하면 블랙홀 붕괴). */
function buildCollision(engine: SimulationEngine): void {
  engine.reset();

  const m = 1500;
  const approach = 4;
  const orbit = Math.sqrt((G * m) / 40); // 각 항성 주위 r=40 행성 공전 속도

  const systems: { sx: number; drift: number }[] = [
    { sx: -160, drift: approach },
    { sx: 160, drift: -approach },
  ];
  for (const { sx, drift } of systems) {
    engine.spawn({ position: [sx, 0, 0], velocity: [drift, 0, 0], mass: m, color: BODY_PRESETS.star.color });
    engine.spawn({
      position: [sx, 0, 40],
      velocity: [drift + orbit, 0, 0],
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
    engine.spawn({
      position: [sx, 0, -40],
      velocity: [drift - orbit, 0, 0],
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }
}

export interface ScenePreset {
  key: string;
  label: string;
  description: string;
  build(engine: SimulationEngine, rng: () => number): void;
}

/** 프리셋 목록. 버튼 순서와 같다. 3단계 시나리오 프리셋. */
export const SCENE_PRESETS: readonly ScenePreset[] = [
  { key: 'solar', label: '안정된 태양계', description: '항성 + 행성 + 소행성 띠', build: buildSolar },
  { key: 'binary', label: '쌍성계', description: '두 항성이 서로를 공전', build: buildBinary },
  { key: 'blackhole', label: '블랙홀', description: '강착원반과 조석 파괴', build: buildBlackHole },
  { key: 'collision', label: '충돌 코스', description: '두 계가 정면충돌', build: buildCollision },
];

/** key에 해당하는 프리셋을 적용한다. 없는 key면 아무것도 하지 않는다. */
export function applyPreset(engine: SimulationEngine, key: string, rng: () => number): void {
  const preset = SCENE_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  preset.build(engine, rng);
}

/**
 * 첫 화면이 텅 빈 우주면 곤란하다. '안정된 태양계' 프리셋을 초기·리셋 씬으로 쓴다.
 * 정의는 buildSolar 한 곳에만 있다(DRY).
 */
export function createStarterSystem(engine: SimulationEngine): void {
  buildSolar(engine);
}
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `pnpm test scenes` / Expected: PASS(신규 블록 + 기존 `createStarterSystem` 블록 모두).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/scenes.ts lib/sim/scenes.test.ts
git commit -m "feat(scenes): 프리셋 레지스트리와 4종 시나리오 추가"
```

---

### Task 2: 영속화 모듈 (`lib/saves.ts`)

**Files:**
- Create: `lib/saves.ts`
- Test: `lib/saves.test.ts`

**Interfaces:**
- Consumes: `SerializedState`, `SerializedBody`(type-only, `./sim/engine`). `BodyType`(`./sim/units`).
- Produces:
  - `interface SaveSlot { id: string; name: string; savedAt: number; state: SerializedState; }`
  - `listSaves(storage: Storage): SaveSlot[]` — `savedAt` 내림차순, 썩은 슬롯 제외.
  - `saveToSlot(storage: Storage, name: string, state: SerializedState): SaveSlot` — 쓰기 실패 시 예외 전파.
  - `deleteSave(storage: Storage, id: string): void`
  - `serializeToJson(state: SerializedState): string`
  - `parseAndValidate(text: string): SerializedState | { error: string }`

- [ ] **Step 1: 실패하는 테스트 작성** — `lib/saves.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { SimulationEngine } from './sim/engine';
import { createStarterSystem } from './sim/scenes';
import { listSaves, saveToSlot, deleteSave, serializeToJson, parseAndValidate } from './saves';
import type { SerializedState } from './sim/engine';

/** node 테스트 환경엔 localStorage가 없으므로 최소 Storage를 주입한다. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function sampleState(): SerializedState {
  const engine = new SimulationEngine();
  createStarterSystem(engine);
  return engine.serialize();
}

describe('saveToSlot / listSaves', () => {
  it('저장 → 목록 → 로드 왕복이 같은 천체 수를 준다', () => {
    const s = fakeStorage();
    const state = sampleState();
    saveToSlot(s, '내 우주', state);

    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('내 우주');
    expect(slots[0].state.bodies).toHaveLength(state.bodies.length);
  });

  it('savedAt 내림차순으로 정렬한다', () => {
    const s = fakeStorage();
    const a = saveToSlot(s, 'A', sampleState());
    const b = saveToSlot(s, 'B', sampleState());
    const slots = listSaves(s);
    // 나중에 저장한 B가 먼저 온다 (savedAt이 같을 수도 있어 id로도 확인)
    expect(slots.map((x) => x.id)).toContain(a.id);
    expect(slots.map((x) => x.id)).toContain(b.id);
    expect(slots[0].savedAt).toBeGreaterThanOrEqual(slots[1].savedAt);
  });

  it('deleteSave는 해당 슬롯만 제거한다', () => {
    const s = fakeStorage();
    const a = saveToSlot(s, 'A', sampleState());
    saveToSlot(s, 'B', sampleState());
    deleteSave(s, a.id);
    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('B');
  });

  it('storage 전체가 깨졌으면 빈 목록을 준다', () => {
    const s = fakeStorage();
    s.setItem('outer-space:saves', '{not json');
    expect(listSaves(s)).toEqual([]);
  });

  it('슬롯 하나가 썩어도 나머지는 보존한다', () => {
    const s = fakeStorage();
    saveToSlot(s, '정상', sampleState());
    const raw = JSON.parse(s.getItem('outer-space:saves')!);
    raw.push({ id: 'x', name: '썩음', savedAt: 1, state: { simTime: NaN, bodies: [] } });
    s.setItem('outer-space:saves', JSON.stringify(raw));
    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('정상');
  });

  it('쓰기 예외(용량 초과 등)를 전파한다', () => {
    const throwing = fakeStorage();
    throwing.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    expect(() => saveToSlot(throwing, 'X', sampleState())).toThrow();
  });
});

describe('parseAndValidate / serializeToJson', () => {
  it('serialize → parse 왕복이 무손실이다', () => {
    const state = sampleState();
    const result = parseAndValidate(serializeToJson(state));
    expect('error' in result).toBe(false);
    expect((result as SerializedState).bodies).toHaveLength(state.bodies.length);
  });

  it('JSON 파싱 실패를 error로 준다', () => {
    expect(parseAndValidate('{not json')).toHaveProperty('error');
  });

  it('simTime이 수치가 아니면 거부한다', () => {
    expect(parseAndValidate('{"simTime":"x","bodies":[]}')).toHaveProperty('error');
  });

  it('bodies가 배열이 아니면 거부한다', () => {
    expect(parseAndValidate('{"simTime":0,"bodies":{}}')).toHaveProperty('error');
  });

  it('body 필드에 NaN이 있으면 거부한다', () => {
    const bad = {
      simTime: 0,
      bodies: [{ x: NaN, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1, type: 0, color: [1, 1, 1] }],
    };
    // NaN은 JSON.stringify에서 null이 되므로 문자열을 직접 만든다
    const text = '{"simTime":0,"bodies":[{"x":null,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":0,"color":[1,1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
    void bad;
  });

  it('알 수 없는 type이면 거부한다', () => {
    const text = '{"simTime":0,"bodies":[{"x":0,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":99,"color":[1,1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
  });

  it('color 형태가 틀리면 거부한다', () => {
    const text = '{"simTime":0,"bodies":[{"x":0,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":0,"color":[1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `pnpm test saves` / Expected: FAIL (`lib/saves.ts` 없음).

- [ ] **Step 3: `lib/saves.ts` 작성**

```ts
import { BodyType } from './sim/units';
import type { SerializedState, SerializedBody } from './sim/engine';

export interface SaveSlot {
  id: string;
  name: string;
  savedAt: number;
  state: SerializedState;
}

const STORAGE_KEY = 'outer-space:saves';
const VALID_TYPES = new Set<number>(Object.values(BodyType));

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidBody(b: unknown): b is SerializedBody {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  if (![o.x, o.y, o.z, o.vx, o.vy, o.vz, o.mass, o.radius].every(isFiniteNumber)) return false;
  if (typeof o.type !== 'number' || !VALID_TYPES.has(o.type)) return false;
  if (!Array.isArray(o.color) || o.color.length !== 3 || !o.color.every(isFiniteNumber)) return false;
  return true;
}

/** 신뢰 불가 입력을 SerializedState로 검증한다. 어긋나면 null. */
function validateSerializedState(v: unknown): SerializedState | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.simTime)) return null;
  if (!Array.isArray(o.bodies)) return null;
  if (!o.bodies.every(isValidBody)) return null;
  return v as SerializedState;
}

/** 파일/텍스트를 파싱·검증한다. 실패하면 사람이 읽을 error 문자열을 준다. */
export function parseAndValidate(text: string): SerializedState | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: '올바른 JSON 파일이 아닙니다.' };
  }
  const state = validateSerializedState(parsed);
  if (!state) return { error: '우주 데이터 형식이 아닙니다.' };
  return state;
}

export function serializeToJson(state: SerializedState): string {
  return JSON.stringify(state);
}

/** STORAGE_KEY에서 슬롯 배열을 읽는다. 전체가 깨졌으면 [], 개별 썩은 슬롯은 건너뛴다. */
function readSlots(storage: Storage): SaveSlot[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const slots: SaveSlot[] = [];
  for (const s of parsed) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !isFiniteNumber(o.savedAt)) continue;
    const state = validateSerializedState(o.state);
    if (!state) continue;
    slots.push({ id: o.id, name: o.name, savedAt: o.savedAt, state });
  }
  return slots;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function listSaves(storage: Storage): SaveSlot[] {
  return readSlots(storage).sort((a, b) => b.savedAt - a.savedAt);
}

/** 새 슬롯을 추가한다. storage.setItem 실패(용량/시크릿 모드)는 예외로 전파된다. */
export function saveToSlot(storage: Storage, name: string, state: SerializedState): SaveSlot {
  const slot: SaveSlot = { id: makeId(), name, savedAt: Date.now(), state };
  const slots = readSlots(storage);
  slots.push(slot);
  storage.setItem(STORAGE_KEY, JSON.stringify(slots));
  return slot;
}

export function deleteSave(storage: Storage, id: string): void {
  const slots = readSlots(storage).filter((s) => s.id !== id);
  storage.setItem(STORAGE_KEY, JSON.stringify(slots));
}
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `pnpm test saves` / Expected: PASS(전체 케이스).

- [ ] **Step 5: 커밋**

```bash
git add lib/saves.ts lib/saves.test.ts
git commit -m "feat(saves): localStorage 슬롯 CRUD와 JSON 검증 추가"
```

---

### Task 3: state 배선 (`state/SimulationProvider.tsx`)

**Files:**
- Modify: `state/SimulationProvider.tsx`

**Interfaces:**
- Consumes: Task 1의 `applyPreset`, `SCENE_PRESETS`(사용은 UI에서). Task 2의 `listSaves`, `saveToSlot`, `deleteSave`, `parseAndValidate`, `SaveSlot`. 엔진의 `serialize()`/`load()`.
- Produces (컨텍스트 값에 추가):
  - `saves: SaveSlot[]`
  - `refreshSaves(): void` — localStorage에서 목록을 다시 읽어 상태 갱신.
  - `applyScenePreset(key: string): void`
  - `saveCurrent(name: string): void`
  - `loadSave(id: string): void`
  - `removeSave(id: string): void`
  - `importState(text: string): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: import 추가** — 파일 상단 import 블록에 다음을 추가한다.

```ts
import { applyPreset } from '@/lib/sim/scenes';
import {
  listSaves,
  saveToSlot,
  deleteSave,
  parseAndValidate,
  type SaveSlot,
} from '@/lib/saves';
```

- [ ] **Step 2: 컨텍스트 타입 확장** — `interface SimulationContextValue`의 `scatter: (mode: ScatterMode) => void;` 아래에 추가한다.

```ts
  saves: SaveSlot[];
  refreshSaves: () => void;
  applyScenePreset: (key: string) => void;
  saveCurrent: (name: string) => void;
  loadSave: (id: string) => void;
  removeSave: (id: string) => void;
  importState: (text: string) => { ok: true } | { ok: false; error: string };
```

- [ ] **Step 3: 상태와 메서드 추가** — `SimulationProvider` 본문에서 `const [scatterCount, setScatterCountState] = useState(50);` 아래에 상태를 추가한다.

```ts
  const [saves, setSaves] = useState<SaveSlot[]>([]);
```

그리고 `scatter` `useCallback` **아래**에 메서드들을 추가한다. (모두 이벤트 핸들러에서만 호출되므로 localStorage·setState 사용이 안전하다 — `set-state-in-effect` 규칙 위반 아님.)

```ts
  // saves 목록은 이벤트 핸들러에서만 갱신한다(마운트 이펙트에서 setState 금지 규칙 회피).
  // 패널을 펼칠 때·저장/삭제할 때 이 함수로 localStorage를 다시 읽는다.
  const refreshSaves = useCallback(() => {
    setSaves(listSaves(localStorage));
  }, []);

  const applyScenePreset = useCallback(
    (key: string) => {
      applyPreset(engine, key, Math.random);
      setSelectedId(null); // load/preset은 id를 무효화한다
    },
    [engine],
  );

  const saveCurrent = useCallback(
    (name: string) => {
      saveToSlot(localStorage, name, engine.serialize());
      setSaves(listSaves(localStorage));
    },
    [engine],
  );

  const loadSave = useCallback(
    (id: string) => {
      const slot = listSaves(localStorage).find((s) => s.id === id);
      if (!slot) return;
      engine.load(slot.state);
      setSelectedId(null);
    },
    [engine],
  );

  const removeSave = useCallback((id: string) => {
    deleteSave(localStorage, id);
    setSaves(listSaves(localStorage));
  }, []);

  const importState = useCallback(
    (text: string): { ok: true } | { ok: false; error: string } => {
      const result = parseAndValidate(text);
      if ('error' in result) return { ok: false, error: result.error };
      engine.load(result);
      setSelectedId(null);
      return { ok: true };
    },
    [engine],
  );
```

- [ ] **Step 4: 컨텍스트 value에 배선** — `useMemo`의 객체에 `scatter,` 아래로 추가하고, 의존성 배열에도 넣는다.

```ts
      scatter,
      saves,
      refreshSaves,
      applyScenePreset,
      saveCurrent,
      loadSave,
      removeSave,
      importState,
```

의존성 배열(`[engine, paused, ... scatterCount, setScatterCount, scatter,]`)의 끝에 추가:

```ts
      scatterCount, setScatterCount, scatter,
      saves, refreshSaves, applyScenePreset, saveCurrent, loadSave, removeSave, importState,
```

- [ ] **Step 5: 타입·린트 확인** — Run: `pnpm check-types && pnpm lint` / Expected: 통과. `set-state-in-effect`·`immutability` 경고 없음(모든 setState가 이벤트 콜백 안). 만약 `react-hooks/exhaustive-deps` 경고가 뜨면 위 콜백들을 의존성 배열에 포함했는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add state/SimulationProvider.tsx
git commit -m "feat(state): 프리셋·세이브/로드 메서드를 컨텍스트에 배선"
```

---

### Task 4: 시나리오 패널 UI (`components/ui/ScenePanel.tsx`)

**Files:**
- Create: `components/ui/ScenePanel.tsx`
- Modify: `components/ui/Overlay.tsx`

**Interfaces:**
- Consumes: `useSimulation()`의 `engine`, `saves`, `refreshSaves`, `applyScenePreset`, `saveCurrent`, `loadSave`, `removeSave`, `importState`. `SCENE_PRESETS`(`@/lib/sim/scenes`), `serializeToJson`(`@/lib/saves`).
- Produces: `export default function ScenePanel()`.

- [ ] **Step 1: `components/ui/ScenePanel.tsx` 작성**

```tsx
'use client';

import { useRef, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';
import { SCENE_PRESETS } from '@/lib/sim/scenes';
import { serializeToJson } from '@/lib/saves';

function defaultSaveName(): string {
  return `우주 ${new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}`;
}

export default function ScenePanel() {
  const {
    engine,
    saves,
    refreshSaves,
    applyScenePreset,
    saveCurrent,
    loadSave,
    removeSave,
    importState,
  } = useSimulation();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) refreshSaves(); // 펼칠 때 최신 목록을 읽는다(이벤트 핸들러 — 규칙 안전)
  };

  const handleSave = () => {
    setError(null);
    try {
      saveCurrent(name.trim() || defaultSaveName());
      setName('');
    } catch {
      setError('저장에 실패했습니다 (저장 공간 부족).');
    }
  };

  const handleExport = () => {
    const json = serializeToJson(engine.serialize());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outer-space-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importState(String(reader.result));
      setError(result.ok ? null : result.error);
    };
    reader.onerror = () => setError('파일을 읽을 수 없습니다.');
    reader.readAsText(file);
  };

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/30 bg-slate-950/80 p-4 backdrop-blur">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between font-mono text-xs tracking-widest text-sky-300 uppercase"
      >
        <span>시나리오</span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* 프리셋 */}
          <div className="space-y-1">
            {SCENE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setError(null);
                  applyScenePreset(preset.key);
                }}
                className="w-full rounded bg-sky-500/15 px-2 py-1.5 text-left text-xs text-sky-100 transition hover:bg-sky-500/35"
              >
                <span className="block">{preset.label}</span>
                <span className="block text-[11px] text-slate-400">{preset.description}</span>
              </button>
            ))}
          </div>

          {/* 세이브 */}
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="세이브 이름"
                className="min-w-0 flex-1 rounded bg-slate-900/80 px-2 py-1 font-mono text-xs text-sky-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/40"
              >
                저장
              </button>
            </div>

            {saves.length === 0 ? (
              <p className="text-[11px] text-slate-500">저장된 우주 없음</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {saves.map((slot) => (
                  <li key={slot.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        loadSave(slot.id);
                      }}
                      className="min-w-0 flex-1 truncate rounded bg-slate-900/60 px-2 py-1 text-left text-xs text-sky-100 transition hover:bg-slate-800"
                      title={slot.name}
                    >
                      {slot.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSave(slot.id)}
                      className="rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-500/40"
                      aria-label={`${slot.name} 삭제`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 파일 */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleExport}
              className="flex-1 rounded bg-slate-800/80 px-2 py-1 text-xs text-sky-100 transition hover:bg-slate-700"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded bg-slate-800/80 px-2 py-1 text-xs text-sky-100 transition hover:bg-slate-700"
            >
              가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `components/ui/Overlay.tsx`에 합류** — 좌상단을 `flex flex-col`로 바꿔 `StatsHud` 아래 `ScenePanel`을 쌓는다. import에 `import ScenePanel from './ScenePanel';`를 추가하고, `top-4 left-4` 블록을 아래로 교체한다.

```tsx
      <div className="absolute top-4 left-4 flex flex-col gap-3">
        <StatsHud />
        <ScenePanel />
      </div>
```

- [ ] **Step 3: 타입·린트·빌드 확인** — Run: `pnpm check-types && pnpm lint && pnpm build` / Expected: 전부 통과. (React 19 `React.ChangeEvent` 타입, 미사용 import 없음 확인.)

- [ ] **Step 4: 브라우저 수동 확인** — Run: `pnpm dev` 후 http://localhost:3000. 스펙 §9 체크리스트를 확인한다:
  - '시나리오' 패널을 펼쳐 프리셋 4개 버튼이 각각 다른 우주(태양계/쌍성/블랙홀+링/충돌)를 즉시 부른다.
  - 블랙홀 프리셋에서 강착원반·렌즈·조석 파괴가 보이고 ISCO 안쪽 링이 빨려든다. 충돌 프리셋이 실제로 충돌·병합한다.
  - 이름 저장 → 목록에 뜸 → 우주를 망가뜨린 뒤 불러오기 → 복원. 새로고침 후에도 목록이 남는다.
  - 내보내기로 `.json`이 다운로드되고, 그 파일 가져오기로 복원된다. 엉뚱한 파일 가져오기는 인라인 에러가 뜨고 현재 우주는 그대로다.
  - 로드·프리셋·임포트 후 선택 카드가 닫힌다.

- [ ] **Step 5: 커밋**

```bash
git add components/ui/ScenePanel.tsx components/ui/Overlay.tsx
git commit -m "feat(ui): 시나리오 프리셋·세이브/로드 패널 추가"
```

---

### Task 5: 문서 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md` (로드맵 3단계 상태)
- Modify: `README.md`

**Interfaces:** 없음(문서).

- [ ] **Step 1: 코어 설계 문서 로드맵 갱신** — `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md`에서 로드맵 3단계('시나리오 프리셋')를 찾아, 완료로 표시하고 구현 위치(`lib/sim/scenes.ts`의 `SCENE_PRESETS`, `lib/saves.ts`, `components/ui/ScenePanel.tsx`)와 설계 문서(`docs/superpowers/specs/2026-07-22-scenario-presets-design.md`)를 참조로 남긴다. (실제 문구는 해당 문서의 로드맵 섹션 형식을 따른다.)

- [ ] **Step 2: README 갱신** — `README.md`에 시나리오/세이브를 소개하는 짧은 섹션을 `## 블랙홀` 아래에 추가한다.

```markdown
## 시나리오와 세이브

좌상단 **시나리오** 패널에서:

- **프리셋** — 안정된 태양계 · 쌍성계 · 블랙홀(강착원반) · 충돌 코스를 버튼 하나로 불러옵니다.
- **세이브** — 지금 우주에 이름을 붙여 저장하고(브라우저에 남습니다), 목록에서 다시 불러오거나 삭제합니다.
- **파일** — 우주를 `.json`으로 내보내 남과 공유하거나, 받은 파일을 가져옵니다.

불러오기·프리셋·가져오기는 저장된 상태로 우주를 통째로 갈아끼웁니다.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md README.md
git commit -m "docs: 로드맵 3단계 완료 반영 및 README 시나리오 안내 추가"
```

---

## Self-Review 메모

- **스펙 커버리지:** §2 프리셋→Task1, §3 영속화→Task2, §4 state→Task3, §5 UI→Task4, §6 테스트→Task1·2에 포함, §7 문서 동기화→Task5. 전부 대응됨.
- **타입 일관성:** provider 메서드명 `applyScenePreset`(UI가 호출) vs lib `applyPreset`(engine 호출) — 의도적으로 구분(별칭 import). `removeSave`(provider)는 lib `deleteSave`를 감싼다. `saves: SaveSlot[]` 타입이 Task2~4 일관.
- **검증 위치:** 파일 임포트·localStorage 슬롯 읽기 모두 `validateSerializedState` 공유. 엔진 `sanitize()`는 최후 방어로 남는다(중복이지만 경계 방어 원칙).
- **react-compiler 규칙:** 모든 `setState`가 이벤트 핸들러(버튼/토글/FileReader.onload) 안 → `set-state-in-effect` 회피. 마운트 이펙트에서 목록을 읽지 않고, 패널 펼침(이벤트) 시 `refreshSaves`로 읽는다.
```
