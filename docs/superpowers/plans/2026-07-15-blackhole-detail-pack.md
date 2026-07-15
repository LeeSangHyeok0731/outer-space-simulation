# 블랙홀 디테일 팩 구현 계획 — 광자 구 링 + 시간 지연

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블랙홀에 물리 디테일 둘을 얹는다 — 카메라를 향하는 광자 구 링(1.5 r_s)과 정보 카드의 중력 시간 지연 표시.

**Architecture:** 시간 지연은 `lib/sim/units.ts`의 순수 함수 `timeDilationAt(rs, r)`로 두고 Vitest로 검증한다. 광자 구 링은 `AccretionDisks.tsx` 패턴을 따르는 새 씬 컴포넌트(단일 InstancedMesh, 매 프레임 카메라를 향해 정렬)다. 시간 지연 표시는 `BodyCard.tsx`의 100ms 폴링에 얹는다 — 블랙홀 카드엔 상수 기준 값, 일반 천체 카드엔 눈에 띌 때만 실제 값.

**Tech Stack:** TypeScript(strict), Vitest, Next.js 16, React 19(React Compiler), React Three Fiber 9 + three 0.184, Tailwind v4

**설계 문서:** `docs/superpowers/specs/2026-07-15-blackhole-detail-pack-design.md` — 설계가 바뀌면 코드와 **같은 커밋에서** 이 문서를 갱신한다.

## Global Constraints

- 패키지 매니저는 **pnpm**.
- TypeScript `strict: true`. **`any` 금지, 타입 문제를 피하려는 `as` 단언 금지.**
- `lib/sim/`은 **React도 three.js도 import하지 않는다.** 순수 TS이며 Vitest로 검증한다.
- 천체의 위치·속도·질량은 **React state에 넣지 않는다.** `BodyCard`는 표시용 스냅샷을 100ms 폴링하는 기존 방식을 그대로 따른다.
- **`useFrame` 안에서 할당하지 않는다.** 재사용 객체는 모듈 스코프에 둔다.
- `engine.step()`의 유일한 호출자는 `components/scene/Bodies.tsx`다. 새 씬 컴포넌트는 엔진을 **읽기만** 하며 `Bodies` **뒤에** 마운트한다.
- **발광은 `meshBasicMaterial` + `toneMapped={false}` + Bloom.** **`AdditiveBlending`을 쓰지 않는다**(강착원반이 유일 예외 — `.claude/rules/ui-conventions.md`).
- **React Compiler:** 렌더 중 `.current` ref에 쓰지 않는다(useFrame·이펙트·핸들러 안에서만). `set-state-in-effect` 규칙 때문에 `BodyCard`는 `selectedId`가 null이면 폴링 effect가 곧바로 return한다 — 이 구조를 깨지 않는다.
- 시간 지연은 시뮬레이션 물리에 **되먹임되지 않는다**(순수 표시). 광자 구는 흡수·충돌 판정에 관여하지 않는다(흡수는 여전히 ISCO).
- 커밋은 Conventional Commits + 한국어 본문. 스코프: `sim`(`lib/sim/`), `scene`, `ui`, `docs`.
- 각 태스크 끝에서 `pnpm test`, `pnpm check-types`, `pnpm lint`가 통과해야 한다. 씬·UI 태스크는 `pnpm build`까지.

## 기존 코드에서 알아야 할 것

- `lib/sim/units.ts` — `G = 1`, `C = 25`, `schwarzschildRadius(mass)`, `iscoRadius(mass)`(= `3·schwarzschildRadius`), `BodyType = { NORMAL: 0, BLACK_HOLE: 1, SHIP: 2 }`, `MAX_BODIES = 512`. 새 심볼은 파일 끝에 append.
- `lib/sim/bodies.ts` — `BodyBuffer`(SoA): `posX/posY/posZ`, `mass`, `type`, `count`, `indexOfId`.
- `components/scene/AccretionDisks.tsx` — 단일 InstancedMesh 씬 컴포넌트의 참고 패턴. 모듈 스코프 `dummy`, `mesh.count = n`, `mesh.visible = n > 0`, `mesh.instanceMatrix.needsUpdate = true`, `frustumCulled={false}`.
- `components/scene/SpaceCanvas.tsx` — `<Canvas>` 경계. `Bodies` 뒤에 `AccretionDisks`·`EffectsController`가 마운트돼 있다. 카메라는 `useFrame((state) => state.camera)`로 얻는다.
- `components/ui/BodyCard.tsx` — 선택 천체를 100ms 폴링. `Info` 인터페이스, 모듈 스코프 `formatEvaporation` 헬퍼, 블랙홀이면 사건의 지평선·ISCO·증발까지를 표시하는 블록이 이미 있다. 낙관적 갱신(`setInfo({ ...info, ... })`) 패턴 사용 중.
- 테스트는 현재 **122개**.

**주의(테스트 수 세기):** "기대 개수"는 대략치다. 신규 테스트만큼 늘면 정상이다. 총합을 하드코딩해 단언하지 말 것.

---

### Task 1: 시간 지연 공식 (`lib/sim/units.ts`)

**Files:**
- Modify: `lib/sim/units.ts`
- Modify: `lib/sim/units.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `PHOTON_SPHERE_FACTOR = 1.5`
  - `timeDilationAt(rs: number, r: number): number` — `√(max(1 − rs/r, 0))`

- [ ] **Step 1: 실패하는 테스트 — `lib/sim/units.test.ts` 끝에 append**

```ts
describe('중력 시간 지연 (timeDilationAt)', () => {
  it('사건의 지평선에서 시간이 멈춘다 (f=0)', () => {
    expect(timeDilationAt(10, 10)).toBe(0);
  });

  it('지평선 안(r < r_s)은 0으로 클램프한다 (음수 sqrt 방지)', () => {
    expect(timeDilationAt(10, 5)).toBe(0);
  });

  it('아주 멀면 지연이 없다 (f→1)', () => {
    expect(timeDilationAt(10, 1e6)).toBeCloseTo(1, 4);
  });

  it('광자 구(1.5 r_s)에서 ≈0.577이다', () => {
    expect(timeDilationAt(10, 1.5 * 10)).toBeCloseTo(Math.sqrt(1 / 3), 10);
  });

  it('ISCO(3 r_s)에서 ≈0.816이다', () => {
    expect(timeDilationAt(10, 3 * 10)).toBeCloseTo(Math.sqrt(2 / 3), 10);
  });

  it('같은 r_s 배수면 질량과 무관하게 같은 값이다', () => {
    // r_s=10에서 r=20, r_s=100에서 r=200 — 둘 다 2배 거리라 같은 f
    expect(timeDilationAt(10, 20)).toBeCloseTo(timeDilationAt(100, 200), 12);
  });

  it('PHOTON_SPHERE_FACTOR는 1.5다', () => {
    expect(PHOTON_SPHERE_FACTOR).toBe(1.5);
  });
});
```

`units.test.ts` 상단 import에 `PHOTON_SPHERE_FACTOR`, `timeDilationAt`을 알파벳 순으로 끼워 넣는다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: FAIL — `timeDilationAt`, `PHOTON_SPHERE_FACTOR`가 `./units`에 없다.

- [ ] **Step 3: 구현 — `lib/sim/units.ts` 끝에 append**

```ts
/** 광자 구 반지름의 r_s 배수. 이 반지름에서 빛은 블랙홀을 궤도로 돈다. */
export const PHOTON_SPHERE_FACTOR = 1.5;

/**
 * 중력 시간 지연 배율. `f = √(1 − r_s/r)`
 *
 * 바깥 관찰자 기준 시계 속도다. 멀면(r→∞) 1(지연 없음), 사건의 지평선(r=r_s)에서 0(정지).
 * r을 r_s의 배수로 재면 f는 질량과 무관하다 — 광자 구(1.5 r_s)에서 늘 ≈0.577,
 * ISCO(3 r_s)에서 늘 ≈0.816이다.
 *
 * r ≤ r_s면 0으로 클램프한다(음수 sqrt 방지).
 */
export function timeDilationAt(rs: number, r: number): number {
  if (r <= rs) return 0;
  return Math.sqrt(1 - rs / r);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: 신규 7개 포함 전부 통과 (약 129개).

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 중력 시간 지연 공식과 광자 구 상수 추가

f=√(1−r_s/r). r을 r_s의 배수로 재면 질량과 무관하다 — 광자 구에서 늘 0.577,
ISCO에서 늘 0.816. r≤r_s면 0으로 클램프한다."
```

---

### Task 2: 광자 구 링 (`components/scene/PhotonSpheres.tsx`)

**Files:**
- Create: `components/scene/PhotonSpheres.tsx`
- Modify: `components/scene/SpaceCanvas.tsx`

**Interfaces:**
- Consumes: `useSimulation()`, `BodyType`, `MAX_BODIES`, `PHOTON_SPHERE_FACTOR`(Task 1), `schwarzschildRadius`
- Produces: `<PhotonSpheres />` — draw call 1회

**핵심:** 매 프레임 각 링을 카메라를 향해 정렬한다(`dummy.lookAt(camera.position)`). RingGeometry의 법선이 로컬 +Z이고 `lookAt`이 +Z를 대상으로 향하게 하므로 링이 카메라를 마주본다. 이것이 블랙홀 이미지의 밝은 테두리처럼 보이게 하고, 황도면에 누운 강착원반과 구별한다.

- [ ] **Step 1: 구현 — `components/scene/PhotonSpheres.tsx`**

```tsx
'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { BodyType, MAX_BODIES, PHOTON_SPHERE_FACTOR, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();

/**
 * 광자 구 링. 블랙홀마다 1.5 r_s에 얇고 밝은 링을 그린다.
 *
 * 이 반지름에서 빛은 블랙홀을 궤도로 돈다 — 블랙홀 이미지(EHT·인터스텔라)에서
 * 그림자를 감싸는 밝은 테두리가 이것이다. 매 프레임 카메라를 향하도록 정렬해
 * (RingGeometry 법선이 +Z, lookAt이 +Z를 카메라로 향하게 한다) 구의 실루엣처럼
 * 보이고, 황도면에 누운 강착원반과 구별된다.
 *
 * 광자 구(1.5 r_s)는 ISCO(3 r_s = 강착원반 안쪽)보다 안쪽, 사건의 지평선(r_s = 검은 구)보다
 * 바깥이라 검은 구를 바로 감싼다. Bodies 뒤에 마운트해 같은 프레임 상태를 읽는다.
 */
export default function PhotonSpheres() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    const cam = state.camera;

    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.lookAt(cam.position); // 링이 카메라를 마주보게 한다
      dummy.scale.setScalar(PHOTON_SPHERE_FACTOR * schwarzschildRadius(b.mass[i]));
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
      <ringGeometry args={[0.92, 1.0, 64]} />
      {/* 밝은 흰빛. 블룸을 받도록 toneMapped를 끈다. AdditiveBlending은 쓰지 않는다
          (강착원반이 유일 예외). depthWrite를 끄지 않으면 뒤 천체를 가린다. */}
      <meshBasicMaterial
        color="#eaf2ff"
        side={THREE.DoubleSide}
        transparent
        opacity={0.9}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
```

- [ ] **Step 2: 마운트 — `components/scene/SpaceCanvas.tsx`**

import를 추가한다(기존 씬 import 옆, 알파벳 순):

```tsx
import PhotonSpheres from './PhotonSpheres';
```

`<AccretionDisks />` 아래에 추가한다:

```tsx
      <AccretionDisks />
      <PhotonSpheres />
```

(기존 `<EffectsController />`·`<CameraRig />` 등 다른 마운트는 그대로 둔다. 순서상 `Bodies` 뒤이기만 하면 된다.)

- [ ] **Step 3: 검증**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 테스트는 Task 1의 수 그대로(이 태스크는 Vitest 테스트를 추가하지 않는다), 나머지 전부 통과.

**브라우저 확인은 사람이 해야 한다.** 자동화 환경에서는 화면을 볼 수 없으므로 "링이 보인다"고 주장하지 말 것. 확인할 것(사람이): 블랙홀 주위에 검은 구를 감싸는 밝은 링이 뜨는가, 카메라를 돌려도 항상 정면(카메라를 향함)인가, 강착원반(누운 평면 링)과 구별되는가, 검은 구와 강착원반 안쪽 테두리 사이에 앉는가.

- [ ] **Step 4: 커밋**

```bash
git add components/scene/PhotonSpheres.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 광자 구 링 추가

블랙홀마다 1.5 r_s에 카메라를 향하는 밝은 링. 이 반지름에서 빛은 블랙홀을
궤도로 돈다 — 블랙홀 이미지의 그 밝은 테두리다. 매 프레임 lookAt으로 카메라를
마주보게 해 누운 강착원반과 구별한다. 단일 InstancedMesh, draw call 1회."
```

---

### Task 3: 시간 지연 표시 (`components/ui/BodyCard.tsx`)

**Files:**
- Modify: `components/ui/BodyCard.tsx`

**Interfaces:**
- Consumes: `timeDilationAt`, `PHOTON_SPHERE_FACTOR`(Task 1), `schwarzschildRadius`, `iscoRadius`
- Produces: 없음 (UI)

**추가할 것:**
- **(a) 블랙홀 카드:** 기존 블랙홀 블록에 상수 기준 줄 — "시간 지연: 광자 구 0.58× · ISCO 0.82×".
- **(b) 일반 천체 카드:** 100ms 폴링에서 모든 블랙홀을 훑어 **가장 강한 지연**(최소 f)을 계산. `f < TIME_DILATION_NOTICEABLE`(0.99)일 때만 "시간 지연: 0.87×"를 표시. 블랙홀이 없거나 멀면 줄을 숨긴다.

- [ ] **Step 1: import 확장 — `components/ui/BodyCard.tsx`**

상단 import를 아래로 바꾼다:

```tsx
import {
  BodyType,
  COLLAPSE_MASS,
  HAWKING_K,
  iscoRadius,
  PHOTON_SPHERE_FACTOR,
  schwarzschildRadius,
  timeDilationAt,
} from '@/lib/sim/units';
```

- [ ] **Step 2: 임계 상수와 `Info` 필드 추가**

`formatEvaporation` 위(모듈 스코프)에 상수를 추가한다:

```tsx
/**
 * 일반 천체 카드에 시간 지연 줄을 띄우는 임계. f가 이 값 미만(=1% 넘게 느려질 때)일 때만
 * 표시한다. 멀어서 밍밍한 "0.998×"로 카드를 어지럽히지 않는다.
 */
const TIME_DILATION_NOTICEABLE = 0.99;
```

`Info` 인터페이스에 필드를 추가한다:

```tsx
interface Info {
  mass: number;
  radius: number;
  speed: number;
  pinned: boolean;
  blackHole: boolean;
  dilation: number | null;
}
```

- [ ] **Step 3: 폴링 tick에서 시간 지연 계산**

`tick` 안의 `setInfo` 호출을 아래로 바꾼다(인덱스 `i`가 이미 있다):

```tsx
      // 일반 천체가 블랙홀 근처에서 겪는 시간 지연. 가장 강한 지연(최소 f)을 주는
      // 블랙홀을 찾아, 눈에 띌 때(f < 임계)만 값을 둔다. 블랙홀 자신은 카드에서
      // 상수 기준 값을 따로 보여주므로 여기선 null이다.
      let dilation: number | null = null;
      if (b.type[i] !== BodyType.BLACK_HOLE) {
        let minF = 1;
        for (let k = 0; k < b.count; k++) {
          if (b.type[k] !== BodyType.BLACK_HOLE) continue;
          const dx = b.posX[i] - b.posX[k];
          const dy = b.posY[i] - b.posY[k];
          const dz = b.posZ[i] - b.posZ[k];
          const r = Math.hypot(dx, dy, dz);
          const f = timeDilationAt(schwarzschildRadius(b.mass[k]), r);
          if (f < minF) minF = f;
        }
        if (minF < TIME_DILATION_NOTICEABLE) dilation = minF;
      }

      setInfo({
        mass: b.mass[i],
        radius: b.radius[i],
        speed: Math.hypot(b.velX[i], b.velY[i], b.velZ[i]),
        pinned: b.pinned[i] === 1,
        blackHole: b.type[i] === BodyType.BLACK_HOLE,
        dilation,
      });
```

- [ ] **Step 4: 카드 본문에 두 표시 추가**

블랙홀 블록((a)) — 기존 `증발까지` 항목 **아래**, 블랙홀 `</>` 프래그먼트 **안**에 추가한다:

```tsx
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">시간 지연</dt>
              <dd className="text-right">
                광자 구{' '}
                {timeDilationAt(
                  schwarzschildRadius(info.mass),
                  PHOTON_SPHERE_FACTOR * schwarzschildRadius(info.mass),
                ).toFixed(2)}
                × · ISCO{' '}
                {timeDilationAt(schwarzschildRadius(info.mass), iscoRadius(info.mass)).toFixed(2)}×
              </dd>
            </div>
```

일반 천체((b)) — `<dl>` 안, 블랙홀 블록 `)}` **바로 아래**에 추가한다:

```tsx
        {!info.blackHole && info.dilation !== null && (
          <div className="flex justify-between">
            <dt className="text-violet-300/70">시간 지연</dt>
            <dd className="text-violet-200">{info.dilation.toFixed(2)}×</dd>
          </div>
        )}
```

- [ ] **Step 5: 검증**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 테스트는 Task 1의 수 그대로, 나머지 전부 통과.

**React Compiler 주의:** `pnpm lint`가 `react-hooks/refs`나 `set-state-in-effect`로 불평하면 규칙을 끄지 말고 구조를 바꿔라(기존 파일이 이미 그렇게 정리돼 있다 — `selectedId`가 null이면 effect가 곧바로 return). 무엇을 왜 바꿨는지 보고할 것.

**브라우저 확인은 사람이 해야 한다.** 확인할 것(사람이): 블랙홀을 선택하면 "시간 지연: 광자 구 0.58× · ISCO 0.82×"가 뜨는가, 일반 천체를 블랙홀 가까이 두고 선택하면 시간 지연이 1 아래로 떨어져 표시되고 멀리 두면 줄이 사라지는가.

- [ ] **Step 6: 커밋**

```bash
git add components/ui/BodyCard.tsx
git commit -m "feat(ui): 정보 카드에 중력 시간 지연 표시

블랙홀 카드엔 상수 기준 값(광자 구 0.58× · ISCO 0.82×), 일반 천체 카드엔
가장 강한 지연을 주는 블랙홀 기준 실제 값을 눈에 띌 때(f<0.99)만 보여준다."
```

---

### Task 4: 최종 검증과 문서 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-blackhole-detail-pack-design.md`

- [ ] **Step 1: 전체 게이트**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 전부 통과.

- [ ] **Step 2: 사람의 브라우저 확인 (자동화 불가 — 반드시 사람에게 넘길 것)**

```bash
pnpm dev
```

확인 목록:
1. 블랙홀 주위에 검은 구를 감싸는 밝은 카메라-정면 링(광자 구)이 보이고, 카메라를 돌려도 항상 정면인가. 강착원반과 구별되는가.
2. 블랙홀을 선택하면 카드에 시간 지연 기준 값이 뜨는가.
3. 일반 천체를 블랙홀 가까이/멀리 두고 선택하면 시간 지연 줄이 나타났다/사라지는가.

**숫자 조정이 필요하면**(§7) `TIME_DILATION_NOTICEABLE`이나 링 두께·색을 고치고 **설계 문서를 같은 커밋에서 갱신한다.**

- [ ] **Step 3: 설계 문서 상태 갱신**

`docs/superpowers/specs/2026-07-15-blackhole-detail-pack-design.md` 상단 상태 줄을 바꾼다:

```markdown
- 상태: 구현 완료 (2026-07-15)
```

구현 중 바꾼 숫자가 있으면 §7의 값을 실제 값과 일치시킨다.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-07-15-blackhole-detail-pack-design.md
git commit -m "docs: 블랙홀 디테일 팩 구현 완료 반영"
```

---

## 완료 기준

- [ ] `pnpm test` 통과 (`timeDilationAt` 경계·질량 무관성 포함) — 기준 122개 + 신규 7개
- [ ] `pnpm check-types`, `pnpm lint`, `pnpm build` 통과
- [ ] 블랙홀 주위에 카메라를 향하는 광자 구 링이 보인다
- [ ] 블랙홀 카드에 상수 기준 시간 지연이, 일반 천체 카드에 눈에 띌 때 실제 시간 지연이 표시된다
- [ ] 설계 문서와 코드의 숫자가 일치한다
