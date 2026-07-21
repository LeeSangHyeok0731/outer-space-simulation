# 시나리오 프리셋 · 세이브/로드 설계 — 3단계

- 작성일: 2026-07-22
- 상태: 승인됨 (구현 대기)
- 범위: 로드맵 3단계. ① 미리 만든 프리셋 시나리오를 버튼으로 불러오기, ② 현재 우주 상태를 저장/복원 — localStorage 이름 붙인 목록 + JSON 파일 내보내기/가져오기.
- 선행: 1단계(코어)·2단계(신의 손 + 블랙홀 물리 팩) 완료. 엔진에 `serialize()`/`load()`가 이미 있다(`lib/sim/engine.ts`).

> 이 문서는 살아있는 설계 문서다. 구현 중 설계가 바뀌면 코드와 함께 이 문서를 갱신한다.

## 1. 목적과 원칙

지금은 첫 화면(`createStarterSystem`)과 리셋 버튼밖에 없다. 사용자가 다양한 초기 우주를 즉시 불러와 "망가뜨리고", 마음에 드는 상태를 저장해 되돌아오거나 남과 공유할 수 있게 한다.

원칙:
- **엔진은 이미 준비됐다.** `serialize()`/`load()`가 우주 상태 ↔ 평범한 객체 왕복을 담당한다. 3단계는 그 위에 프리셋 생성·영속화·UI만 얹는다. 엔진 물리는 건드리지 않는다.
- **관심사 3분리** (A안): 프리셋 생성(순수 물리, `lib/sim/`), 영속화(브라우저 API + 검증, `lib/saves.ts`), UI(`components/ui/`). `lib/sim/`은 React·three·브라우저 API를 모르는 Vitest 대상이라는 규칙을 지키기 위해 localStorage 코드는 `lib/sim/` 밖에 둔다.
- **신뢰 불가 입력 방어.** 파일 업로드와 깨진 localStorage는 신뢰할 수 없다. 엔진에 넣기 전에 형태를 검증하고, 실패 시 엔진을 건드리지 않는다.

## 2. 프리셋 (`lib/sim/scenes.ts` 확장)

현재 `createStarterSystem(engine)` 하나뿐인 것을 **레지스트리**로 일반화한다.

```ts
export interface ScenePreset {
  key: string;
  label: string;        // 버튼 라벨
  description: string;   // 짧은 부제
  build(engine: SimulationEngine, rng: () => number): void;
}

export const SCENE_PRESETS: readonly ScenePreset[];
export function applyPreset(engine: SimulationEngine, key: string, rng: () => number): void;
```

- 각 `build`는 `engine.reset()` 후 천체를 스폰한다(현재 `createStarterSystem`과 같은 방식).
- 난수는 **인자로 주입**한다 — `lib/sim`은 `Math.random`을 직접 부르지 않는다(`scatter.ts`와 동일 규칙). provider가 `Math.random`을 넘긴다.
- `createStarterSystem(engine)`은 유지하되 내부에서 '안정된 태양계' 프리셋의 `build`를 호출하도록 바꾼다 — 리셋·초기 로딩 동작은 불변, 정의는 한 곳(DRY).

**프리셋 4종:**

1. **`solar` — 안정된 태양계.** 현재 `createStarterSystem` 내용(항성 1 + 행성 3 + 소행성 띠 60). '망가뜨릴' 기본 캔버스.
2. **`binary` — 쌍성계(이중성).** 비슷한 질량의 두 항성이 공통 무게중심을 원궤도로 돈다(각자 `v = √(G·m_other / (2r)) · ...` 형태로 반대 방향 속도). 바깥 넓은 궤도에 행성 1~2개. 행성을 안쪽으로 던지면 교란된다.
3. **`blackhole` — 블랙홀 + 강착원반.** 중앙에 무거운 천체를 스폰한 뒤 반환된 id로 `engine.collapseToBlackHole(id)`를 호출해 블랙홀로 만든다(스폰이 반지름을 `radiusFromMass`로 계산하므로, 사건의 지평선 반지름은 기존 붕괴 로직에 맡긴다 — 재사용). 주위에 여러 반지름의 공전 링을 뿌려 ISCO 흡수·조석 파괴·중력 렌즈를 즉시 구경한다. 일부 링은 ISCO 안쪽에 둬 곧바로 빨려들게 한다.
4. **`collision` — 충돌 코스.** 좌우(또는 상하)에 각각 작은 계(항성+행성 몇 또는 성단)를 만들고, 서로를 향한 상대 속도를 준다. 명백한 충돌·병합·(질량이 충분하면) 블랙홀 붕괴를 연출.

각 프리셋의 구체 수치(질량·반지름·개수)는 §7 조정 대상. `BODY_PRESETS`·`circularVelocity` 등 기존 헬퍼를 재사용한다.

## 3. 영속화 (`lib/saves.ts` 신규)

순수 로직만 담는다 — **문자열 ↔ 객체 + 검증 + 슬롯 CRUD**. 실제 `File`/`Blob`/앵커 다운로드/파일 입력 같은 DOM 배관은 UI가 맡는다. `Storage`를 인자로 주입해 가짜 storage로 Vitest 가능하게 한다. `SerializedState` 타입만 `engine`에서 type-only import(React·three·브라우저 API 없음).

```ts
export interface SaveSlot {
  id: string;          // crypto.randomUUID() 또는 시간+난수
  name: string;
  savedAt: number;     // Date.now()
  state: SerializedState;
}

const STORAGE_KEY = 'outer-space:saves';

export function listSaves(storage: Storage): SaveSlot[];
export function saveToSlot(storage: Storage, name: string, state: SerializedState): SaveSlot;
export function deleteSave(storage: Storage, id: string): void;

export function serializeToJson(state: SerializedState): string;         // 파일 내보내기 본문
export function parseAndValidate(text: string): SerializedState | { error: string };  // 파일/슬롯 검증
```

- **`listSaves`**: `STORAGE_KEY`를 읽어 파싱한다. 전체가 깨졌으면 `[]`. 개별 슬롯 중 `state`가 검증 실패하는 것은 **건너뛴다**(하나가 썩어도 나머지는 보존). `savedAt` 내림차순 정렬.
- **`saveToSlot`**: 목록을 읽어 새 슬롯을 추가하고 다시 쓴다. 쓰기는 `try/catch`(용량 초과·시크릿 모드) — 실패 시 예외를 던져 호출자가 메시지를 띄운다.
- **`serializeToJson` / `parseAndValidate`**: `JSON.stringify` / `JSON.parse` + 형태 검증. 파일 임포트와 localStorage 슬롯 읽기가 같은 검증을 공유한다.
- **검증(`parseAndValidate` 내부 `validateSerializedState`)**: `simTime`이 유한 수인가, `bodies`가 배열인가, 각 body의 `x,y,z,vx,vy,vz,mass,radius`가 유한 수인가, `type`이 알려진 `BodyType` 값인가, `color`가 길이 3의 수 배열인가. 하나라도 어긋나면 `{ error }`. (엔진의 `sanitize()`가 NaN을 마지막에 걸러 주지만, 방어는 경계에서 한다.)

## 4. state 배선 (`state/SimulationProvider.tsx`)

컨텍스트에 추가:

```ts
saves: SaveSlot[];
applyPreset(key: string): void;
saveCurrent(name: string): void;
loadSave(id: string): void;
deleteSave(id: string): void;
importState(text: string): { ok: true } | { ok: false; error: string };
```

- `applyPreset` → `applyPreset(engine, key, Math.random)` + `setSelectedId(null)`.
- `saveCurrent` → `saveToSlot(localStorage, name || 기본이름, engine.serialize())` 후 `saves` 상태 갱신. 빈 이름은 `우주 YYYY-MM-DD HH:MM` 형태 기본값.
- `loadSave` → 슬롯을 찾아 `engine.load(slot.state)` + `setSelectedId(null)`.
- `deleteSave` → `deleteSave(localStorage, id)` 후 `saves` 갱신.
- `importState` → `parseAndValidate(text)`; 성공하면 `engine.load(state)` + `setSelectedId(null)` 후 `{ ok: true }`, 실패하면 `{ ok: false, error }`(엔진 불변).
- `saves`는 `useState<SaveSlot[]>`. 마운트 시 `listSaves(localStorage)`로 초기화(브라우저에서만 — SSR 가드). 저장·삭제가 이 상태를 갱신해 UI가 리렌더.
- **id 무효화 대응**: 로드·프리셋·임포트는 전부 `setSelectedId(null)`로 끝난다. `load()`가 새 id를 발급하므로(`engine.ts:264` 주석) 이전 선택은 무효다.
- 내보내기(다운로드)는 상태를 바꾸지 않으므로 provider에 두지 않는다 — UI가 `engine.serialize()` + `serializeToJson`으로 직접 Blob을 만든다.

## 5. UI (`components/ui/ScenePanel.tsx` 신규)

**배치**: `Overlay.tsx`의 좌상단, `StatsHud` 아래. 기본 **접힌** 상태의 헤더 버튼(예: "시나리오 ▸")을 누르면 펼쳐진다 — 목록이 길어져도 화면을 잡아먹지 않게. 펼침 여부는 컴포넌트 로컬 `useState`(시뮬레이션 상태 아님).

기존 톤 유지: `bg-slate-950/80`, `border-sky-400/30`, `backdrop-blur`, `rounded-lg`, `font-mono text-xs`, 라벨 `uppercase tracking-widest text-sky-300`. `pointer-events-auto`.

펼치면 세 섹션:

1. **프리셋** — `SCENE_PRESETS.map`으로 버튼 4개. 클릭 → `applyPreset(key)`. 각 버튼에 `label` + `description` 부제.
2. **세이브** — 이름 입력(`<input>`) + `저장` 버튼(→ `saveCurrent`). 아래에 `saves` 목록: 각 항목에 이름·저장 시각, `불러오기`(→ `loadSave`)·`삭제`(→ `deleteSave`). 목록은 `max-h-48 overflow-y-auto`. 비어 있으면 "저장된 우주 없음".
3. **파일** — `내보내기` 버튼(→ `engine.serialize()`를 `serializeToJson`으로 문자열화 → `Blob` → 임시 `<a download>` 클릭, 파일명 `outer-space-YYYY-MM-DD.json`) · `가져오기`(숨긴 `<input type="file" accept="application/json">`, `FileReader`로 텍스트 읽어 `importState(text)` 호출).

**에러 표시**: `importState` 실패나 저장 예외 시 패널 안 인라인 메시지(예: `text-rose-300` 한 줄). 성공하면 메시지 지움.

`Overlay.tsx`는 좌상단을 `flex flex-col gap-3`로 바꿔 `StatsHud` 아래 `ScenePanel`을 쌓는다.

## 6. 파일과 테스트

**생성:**
- `lib/saves.ts` — 슬롯 CRUD·JSON 직렬화·검증.
- `lib/saves.test.ts` — Vitest.
- `components/ui/ScenePanel.tsx` — 프리셋·세이브·파일 UI.

**수정:**
- `lib/sim/scenes.ts` — `ScenePreset`·`SCENE_PRESETS`·`applyPreset` 추가, `createStarterSystem`을 프리셋 재사용으로.
- `lib/sim/scenes.test.ts` — 프리셋 테스트 추가.
- `state/SimulationProvider.tsx` — 컨텍스트에 세이브/프리셋 메서드·`saves` 상태.
- `components/ui/Overlay.tsx` — 좌상단에 `ScenePanel` 합류.
- (문서) `docs/superpowers/specs/2026-07-14-space-sandbox-core-design.md` 로드맵 3단계 상태, `README.md`.

**테스트(`lib/saves.test.ts`, 가짜 `Storage` 주입):**
- 저장 → 목록 → 로드 왕복이 같은 상태를 준다.
- `parseAndValidate`가 불량 입력을 거부한다: JSON 파싱 실패, `simTime` 비수치, `bodies` 비배열, body 필드 NaN/누락, `type` 미지값, `color` 형태 오류 — 각각 `{ error }`.
- `serializeToJson` → `parseAndValidate` 왕복 무손실.
- `listSaves`: 전체 깨진 storage → `[]`, 슬롯 하나만 썩음 → 나머지 보존, `savedAt` 내림차순.
- `saveToSlot` 쓰기 예외(용량 초과 흉내)가 전파된다.

**테스트(`lib/sim/scenes.test.ts`):**
- 각 프리셋 `build` 후 천체 수가 기대 범위, 모든 위치·속도·질량이 유한(NaN 없음).
- `blackhole` 프리셋이 `BodyType.BLACK_HOLE` 천체를 정확히 1개 만든다.
- `applyPreset(engine, '없는키', rng)`는 안전하게 무시(또는 명시적 처리).
- `createStarterSystem`이 `solar` 프리셋과 같은 결과를 낸다.

## 7. 조정 가능한 숫자와 한계

- 각 프리셋의 질량·반지름·천체 개수·상대 속도는 사람이 브라우저에서 "재미있고 안정적"이 되도록 맞춘다(장난감 성격 — 정확성보다 반응성).
- 세이브 목록 `max-h`, 파일명 형식, 기본 세이브 이름 형식 — 가독성 조정 대상.
- localStorage 용량(브라우저 ~5MB)은 `MAX_BODIES=512` × 세이브 몇 개로는 문제없다. 무제한 목록이라도 실질 상한은 브라우저가 준다 — 초과 시 §5의 에러 표시로 처리하고 별도 개수 제한은 두지 않는다(YAGNI).

## 8. 비목표

- **엔진·물리 변경 없음.** `serialize()`/`load()`는 그대로 재사용. 프리셋은 기존 `spawn`/`collapseToBlackHole`만 부른다.
- **id 안정 왕복 없음.** `load()`가 id를 새로 발급하는 기존 동작을 그대로 둔다. UI는 로드 후 선택을 비워 대응한다(§4). id 보존을 위해 엔진을 고치지 않는다.
- **서버/클라우드 저장 없음.** localStorage와 로컬 파일만. 계정·동기화·공유 링크는 범위 밖.
- **프리셋 편집기 없음.** 프리셋은 코드로 정의한다. 사용자가 프리셋을 만들어 등록하는 UI는 만들지 않는다(그건 세이브가 담당).
- **자동 저장·되돌리기(undo) 없음.** 명시적 저장/불러오기만.

## 9. 사람의 브라우저 확인 (자동화 불가)

- 프리셋 버튼 4개가 각각 눈에 띄게 다른 우주를 즉시 부른다(태양계 / 쌍성 / 블랙홀+링 / 충돌).
- `blackhole` 프리셋에서 강착원반·렌즈·조석 파괴가 실제로 보이고, ISCO 안쪽 링이 빨려든다.
- `collision` 프리셋이 실제로 충돌·병합한다.
- 이름 넣고 저장 → 목록에 뜸 → 우주를 망가뜨린 뒤 불러오기 → 저장 시점으로 복원.
- 새로고침 후에도 세이브 목록이 남아 있다.
- 내보내기 → `.json` 파일이 다운로드됨. 가져오기 → 그 파일로 복원됨.
- 깨진/엉뚱한 파일 가져오기 → 인라인 에러가 뜨고 현재 우주는 그대로.
- 로드·프리셋 적용·임포트 후 선택 카드가 닫힌다(id 무효화 대응).
