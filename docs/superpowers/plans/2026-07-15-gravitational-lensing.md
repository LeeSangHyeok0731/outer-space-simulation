# 중력 렌즈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블랙홀 뒤의 빛(배경별·천체·강착원반·광자 구 링)이 휘어 보이는 전체 화면 후처리 중력 렌즈 효과를 추가한다.

**Architecture:** 기존 `EffectComposer` 파이프라인에 커스텀 후처리 이펙트 하나(`GravitationalLensing`)를 `Bloom` 앞에 얹는다. 매 프레임 각 블랙홀을 카메라로 화면 좌표에 투영해 셰이더 uniform 배열로 넘기고, 프래그먼트 셰이더의 `mainUv`가 UV를 렌즈 중심으로 당겨 프레임버퍼 전체를 왜곡한다. 물리에 되먹임 없는 순수 표시 효과다.

**Tech Stack:** TypeScript, `postprocessing`(커스텀 `Effect` + GLSL `mainUv`), `@react-three/postprocessing`(`EffectComposer`), `@react-three/fiber`(`useFrame`/`useThree`), three.js.

## Global Constraints

- 휘어짐 공식: `lensDeflection(rs, b) = 2·r_s / b`. `b ≤ 0`이면 `0` 반환(0 나눗셈 방지).
- `MAX_LENSES = 4` — 동시에 왜곡에 넣는 블랙홀 상한. 화면상 겉보기 크기가 큰 순으로 최대 4개.
- 셰이더 변위는 화면 거리 `d`에 대해 `∝ 겉보기반지름² / d`(가까울수록 강하게 중심으로 당김) — 큰 블랙홀(큰 r_s)이 더 크게 휜다.
- 이펙트는 엔진을 **읽기만** 한다. 물리에 되먹임 없음(결정론 보존). 흡수·충돌은 여전히 ISCO 기준.
- `useFrame`/이펙트 갱신 안에서 할당 금지 — 모듈 스코프 재사용 객체(`THREE.Vector3`/`THREE.Vector2`)를 쓴다(`Bodies.tsx`/`PhotonSpheres.tsx` 패턴).
- 발광은 `meshBasicMaterial` + `toneMapped={false}` + `Bloom` 패턴. `AdditiveBlending` 금지(강착원반이 유일 예외).
- 마운트 위치: `SpaceCanvas.tsx`의 `<EffectComposer>` 안, `<Bloom>` **앞에**.
- 깊이 버퍼를 쓰지 않는다(전체 화면 왜곡). 프레임버퍼 전체를 휜다.
- 설계가 바뀌면 코드와 같은 커밋에서 스펙 문서(`docs/superpowers/specs/2026-07-15-gravitational-lensing-design.md`)를 갱신한다.
- 스펙에 명시된 물리·시각은 사람이 브라우저로 확인한다(셰이더는 Vitest 대상 아님).

---

### Task 1: 휘어짐 공식 `lensDeflection` (순수 함수)

**Files:**
- Modify: `lib/sim/units.ts` (파일 끝에 함수 추가)
- Test: `lib/sim/units.test.ts` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: 기존 `schwarzschildRadius(mass: number): number` (동일 파일, 참고용).
- Produces: `lensDeflection(rs: number, b: number): number` — 빛의 휘어짐 각 근사 `2·r_s/b`, `b ≤ 0`이면 `0`.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/sim/units.test.ts` 파일 끝(마지막 `});` 다음 줄)에 아래 블록을 추가한다. 파일 상단 import에 `lensDeflection`이 없으면 기존 `units` import 목록에 더한다(예: `import { ..., lensDeflection } from './units';` — 실제 import 형태는 파일 상단을 보고 맞춘다).

```ts
describe('lensDeflection', () => {
  it('b = r_s 이면 휘어짐 각이 2다', () => {
    expect(lensDeflection(10, 10)).toBeCloseTo(2);
  });

  it('b = 2·r_s 이면 휘어짐 각이 1이다 (거리 2배 → 절반)', () => {
    expect(lensDeflection(10, 20)).toBeCloseTo(1);
  });

  it('b 가 아주 크면 휘어짐 각이 0에 가깝다', () => {
    expect(lensDeflection(10, 1000)).toBeCloseTo(0.02, 3);
    expect(lensDeflection(10, 100000)).toBeLessThan(0.001);
  });

  it('같은 b 에서 r_s(질량)가 클수록 더 크게 휜다', () => {
    expect(lensDeflection(20, 50)).toBeGreaterThan(lensDeflection(10, 50));
  });

  it('b <= 0 이면 0을 반환한다 (0 나눗셈 방지)', () => {
    expect(lensDeflection(10, 0)).toBe(0);
    expect(lensDeflection(10, -5)).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: FAIL — `lensDeflection is not a function` 또는 `not exported` 류의 에러.

- [ ] **Step 3: 최소 구현**

`lib/sim/units.ts` 파일 끝에 추가한다(기존 `timeDilationAt` 아래 등, 함수 정의들이 모인 곳):

```ts
/**
 * 질량을 스치는 빛의 휘어짐 각 근사. 충돌 파라미터 b(빛이 블랙홀 중심을 스치는 최소
 * 거리)에서 α = 2·r_s/b. 약한장(b ≫ r_s) 근사이며, 이 프로젝트의 다른 물리 상수처럼
 * 교육적으로 옳은 스케일을 준다. b가 2배면 휘어짐이 절반, 질량이 크면 더 크게 휜다.
 * b ≤ 0은 0으로 막아 0 나눗셈을 방지한다(물리적으로 b는 양수).
 */
export function lensDeflection(rs: number, b: number): number {
  if (b <= 0) return 0;
  return (2 * rs) / b;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test lib/sim/units.test.ts`
Expected: PASS — 새 5개 케이스 포함 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add lib/sim/units.ts lib/sim/units.test.ts
git commit -m "feat(sim): 중력 렌즈 휘어짐 공식 lensDeflection 추가"
```

---

### Task 2: 중력 렌즈 후처리 이펙트

**Files:**
- Create: `components/scene/GravitationalLensing.tsx`
- Modify: `components/scene/SpaceCanvas.tsx` (import 추가 + `<EffectComposer>` 안 `<Bloom>` 앞에 마운트)

**Interfaces:**
- Consumes: `useSimulation()`의 `engine`(`engine.bodies`: SoA `Float64Array`들 — `count`, `type[i]`, `posX/posY/posZ[i]`, `mass[i]`). `BodyType.BLACK_HOLE`, `schwarzschildRadius(mass)` (from `@/lib/sim/units`). `postprocessing`의 `Effect`. `@react-three/fiber`의 `useFrame`, `useThree`.
- Produces: 기본 내보내기 React 컴포넌트 `GravitationalLensing`. `<EffectComposer>`의 자식으로 마운트되며 `<primitive object={effect} />`를 반환한다.

**배경 지식 (구현자 필독):**
- `postprocessing`의 커스텀 이펙트는 `Effect` 서브클래스다: `super(name, fragmentShader, { uniforms: Map<string, THREE.Uniform>, defines: Map<string,string> })`. 셰이더 진입점으로 `void mainUv(inout vec2 uv)`를 정의하면, 프레임워크가 이 함수로 UV를 변형한 뒤 그 좌표로 입력 프레임버퍼를 자동 샘플링한다. 그래서 색을 직접 쓰지 않고 UV만 당기면 배경이 휜다. 검은 사건의 지평선 그림자는 이미 렌더된 블랙홀 구체(Bodies.tsx)가 프레임버퍼에 있으므로, 그것이 함께 휘며 그림자가 된다 — 셰이더에서 검은색을 합성하지 않는다.
- GLSL 배열 크기는 컴파일 상수여야 하므로 `MAX_LENSES`는 `defines`로 넘긴다.
- 카메라·엔진에 매 프레임 접근해 uniform을 갱신해야 하므로, 이펙트 인스턴스를 `useMemo`로 만들고 `useFrame`에서 직접 `effect.uniforms.get('...').value`를 갱신한다(`wrapEffect` 생성자 인자 매핑에 의존하지 않는다). `state.camera`로 투영, `useThree`의 `size`로 화면비.
- `<EffectComposer>`는 자식 이펙트들을 순서대로 하나의 패스로 묶는다. `<primitive object={effect} dispose={null} />`를 자식으로 두면 이펙트로 인식된다. 순서가 곧 패스 순서이므로 `<Bloom>` 앞에 둔다.

- [ ] **Step 1: 이펙트 파일 작성**

`components/scene/GravitationalLensing.tsx`를 생성한다:

```tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';
import { BodyType, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// 동시에 왜곡에 넣는 블랙홀 상한. GLSL 배열 크기라 defines로 셰이더에 넘긴다.
const MAX_LENSES = 4;

// 변위 강도 배율. 겉보기 반지름²에 곱해 화면 거리로 나눈 값이 UV 변위가 된다.
// 시각 조정 대상(스펙 §7).
const STRENGTH_SCALE = 0.35;

// mainUv: 각 렌즈 중심으로 UV를 당겨 배경을 휘게 한다. 여러 렌즈는 변위를 누적한다.
// 화면비 보정(d.x *= uAspect)으로 원형 왜곡을 유지한다.
const fragmentShader = /* glsl */ `
uniform int uLensCount;
uniform vec2 uCenters[MAX_LENSES];
uniform float uRadii[MAX_LENSES];
uniform float uStrength[MAX_LENSES];
uniform float uAspect;

void mainUv(inout vec2 uv) {
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec2 d = uv - uCenters[i];
    d.x *= uAspect;
    float dist = length(d);
    if (dist < 1e-4) continue;
    // 가까울수록 강하게 당기되, 지평선 반지름 안에서는 발산하지 않도록 클램프.
    float pull = uStrength[i] / max(dist, uRadii[i]);
    vec2 dir = d / dist;   // 중심에서 바깥 방향(화면비 공간)
    dir.x /= uAspect;      // uv 공간으로 복원
    uv -= dir * pull;      // 샘플 좌표를 중심 쪽으로 당김
  }
}
`;

class LensingEffectImpl extends Effect {
  constructor() {
    super('GravitationalLensing', fragmentShader, {
      // 왜곡 결과가 원본을 대체해야 한다. 기본값 SCREEN은 원본과 합성돼 화면이 밝아진다.
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uLensCount', new THREE.Uniform(0)],
        [
          'uCenters',
          new THREE.Uniform(
            Array.from({ length: MAX_LENSES }, () => new THREE.Vector2()),
          ),
        ],
        ['uRadii', new THREE.Uniform(new Float32Array(MAX_LENSES))],
        ['uStrength', new THREE.Uniform(new Float32Array(MAX_LENSES))],
        ['uAspect', new THREE.Uniform(1)],
      ]),
      defines: new Map<string, string>([['MAX_LENSES', String(MAX_LENSES)]]),
    });
  }
}

// useFrame 안에서 할당하지 않기 위한 모듈 스코프 재사용 객체.
const proj = new THREE.Vector3();
const edge = new THREE.Vector3();
const camRight = new THREE.Vector3();
// 상위 MAX_LENSES개 선택용 스크래치(겉보기 반지름과 화면 좌표). 프레임마다 재사용.
const slotCx = new Float32Array(MAX_LENSES);
const slotCy = new Float32Array(MAX_LENSES);
const slotR = new Float32Array(MAX_LENSES);

/**
 * 중력 렌즈 후처리 이펙트. 매 프레임 화면상 겉보기 크기가 큰 블랙홀 최대 MAX_LENSES개를
 * 골라 화면 좌표·반지름·강도를 셰이더 uniform에 채운다. 셰이더가 프레임버퍼 전체를
 * 렌즈 중심으로 당겨 빛이 휘는 아인슈타인 링을 만든다. 엔진을 읽기만 하며 물리에
 * 되먹임하지 않는다(결정론 보존). Bloom 앞에 마운트한다.
 */
export default function GravitationalLensing() {
  const { engine } = useSimulation();
  const size = useThree((s) => s.size);
  const effect = useMemo(() => new LensingEffectImpl(), []);

  useFrame((state) => {
    const cam = state.camera;
    const b = engine.bodies;
    const aspect = size.width / size.height;

    // 카메라의 오른쪽 벡터(월드) — 겉보기 반지름 측정에 쓴다.
    camRight.setFromMatrixColumn(cam.matrixWorld, 0);

    // 각 블랙홀을 투영해, 겉보기 반지름 큰 순으로 상위 MAX_LENSES개를 슬롯에 유지한다.
    let n = 0; // 채워진 슬롯 수
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      const rs = schwarzschildRadius(b.mass[i]);

      // 중심을 화면(UV [0,1])으로 투영.
      proj.set(b.posX[i], b.posY[i], b.posZ[i]).project(cam);
      const cx = proj.x * 0.5 + 0.5;
      const cy = proj.y * 0.5 + 0.5;
      // 카메라 뒤(z > 1)면 건너뛴다.
      if (proj.z > 1) continue;

      // 겉보기 반지름: 중심에서 카메라-오른쪽으로 rs만큼 떨어진 점을 투영해 UV 거리로.
      edge
        .set(
          b.posX[i] + camRight.x * rs,
          b.posY[i] + camRight.y * rs,
          b.posZ[i] + camRight.z * rs,
        )
        .project(cam);
      const ex = edge.x * 0.5 + 0.5;
      const ey = edge.y * 0.5 + 0.5;
      let appR = Math.hypot((ex - cx) * aspect, ey - cy);
      if (!Number.isFinite(appR) || appR <= 0) continue;

      // 상위 MAX_LENSES개 삽입(겉보기 반지름 큰 것 우선). 정렬 없이 슬롯 삽입.
      if (n < MAX_LENSES) {
        slotCx[n] = cx;
        slotCy[n] = cy;
        slotR[n] = appR;
        n++;
      } else {
        // 가장 작은 슬롯을 찾아 더 크면 교체.
        let minIdx = 0;
        for (let k = 1; k < MAX_LENSES; k++) {
          if (slotR[k] < slotR[minIdx]) minIdx = k;
        }
        if (appR > slotR[minIdx]) {
          slotCx[minIdx] = cx;
          slotCy[minIdx] = cy;
          slotR[minIdx] = appR;
        }
      }
    }

    const centers = effect.uniforms.get('uCenters')!.value as THREE.Vector2[];
    const radii = effect.uniforms.get('uRadii')!.value as Float32Array;
    const strength = effect.uniforms.get('uStrength')!.value as Float32Array;
    for (let k = 0; k < n; k++) {
      centers[k].set(slotCx[k], slotCy[k]);
      radii[k] = slotR[k];
      // 변위 강도 ∝ 겉보기 반지름²(즉 화면상 rs²) — 큰 블랙홀이 더 크게 휜다.
      strength[k] = STRENGTH_SCALE * slotR[k] * slotR[k];
    }
    effect.uniforms.get('uLensCount')!.value = n;
    effect.uniforms.get('uAspect')!.value = aspect;
  });

  return <primitive object={effect} dispose={null} />;
}
```

- [ ] **Step 2: `SpaceCanvas.tsx`에 마운트**

`components/scene/SpaceCanvas.tsx`에서 import를 추가하고(다른 씬 import들과 같은 곳):

```tsx
import GravitationalLensing from './GravitationalLensing';
```

그리고 `<EffectComposer>` 안, `<Bloom .../>` **앞** 줄에 마운트한다:

```tsx
      <EffectComposer>
        <GravitationalLensing />
        <Bloom intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm check-types`
Expected: PASS — 타입 에러 없음. (`effect.uniforms.get(...)!.value` 캐스팅과 `THREE.Uniform` 사용이 통과해야 한다.)

- [ ] **Step 4: 린트**

Run: `pnpm lint`
Expected: PASS. (React Compiler 규칙 위반 없음 — `useFrame` 안에서만 이펙트/엔진을 mutate하고, 렌더 중 ref 쓰기 없음.)

- [ ] **Step 5: 빌드**

Run: `pnpm build`
Expected: PASS — Compiled successfully. (셰이더 컴파일은 런타임이라 빌드는 통과하지만, GLSL 오류는 브라우저에서 드러난다 — Step 6에서 확인.)

- [ ] **Step 6: 사람 브라우저 확인 (자동화 불가)**

`pnpm dev`로 띄우고 블랙홀을 만들어(질량 슬라이더로 항성을 COLLAPSE_MASS 이상으로 키우거나 프리셋) 확인한다:
- 블랙홀 뒤 배경별이 그림자를 감싸며 링으로 휘어 모이는가.
- 카메라를 돌려도 왜곡 중심이 블랙홀을 따라가는가.
- 강착원반/광자 구 링이 함께 휘어 인터스텔라 룩이 나는가.
- 큰 블랙홀이 작은 블랙홀보다 크게 휘는가.
- 블랙홀이 없으면 화면이 정상(왜곡 없음)인가.
- 브라우저 콘솔에 GLSL 컴파일 에러가 없는가.

(이 단계는 커밋을 막지 않는다 — 시각 확인은 최종 머지 전 사람이 한다. 콘솔에 셰이더 에러가 뜨면 그 자리에서 고친다.)

- [ ] **Step 7: 커밋**

```bash
git add components/scene/GravitationalLensing.tsx components/scene/SpaceCanvas.tsx
git commit -m "feat(scene): 중력 렌즈 후처리 이펙트 추가"
```

---

### Task 3: 설계 문서 동기화 + 전체 게이트

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-gravitational-lensing-design.md` (상태 줄 + §3 셰이더 방식 반영)

**Interfaces:**
- Consumes: 없음(문서 작업).
- Produces: 없음.

- [ ] **Step 1: 상태 줄 갱신**

`docs/superpowers/specs/2026-07-15-gravitational-lensing-design.md`의 4번째 줄을 바꾼다:

```
- 상태: 승인됨 (구현 대기)
```
→
```
- 상태: 구현 완료 (2026-07-15)
```

- [ ] **Step 2: §3 셰이더 방식 명확화**

§3의 "프래그먼트 셰이더 (개념)" 문단에서 "사건의 지평선 반지름 안쪽(`d < horizonRadius`)은 검게 출력(그림자)." 줄을 아래로 교체한다(실제 구현이 `mainUv`로 UV만 왜곡하고, 그림자는 이미 렌더된 블랙홀 구체가 함께 휘어 제공하는 방식임을 반영):

```
- 검은 사건의 지평선 그림자는 별도로 합성하지 않는다. 이미 렌더된 블랙홀 구체가 프레임버퍼에 있어 UV 왜곡과 함께 휘며 그림자가 된다. 셰이더 진입점은 `mainUv(inout vec2 uv)`이며, UV를 렌즈 중심으로 당기면 프레임워크가 그 좌표로 입력을 샘플링한다.
```

- [ ] **Step 3: 전체 게이트 실행**

Run: `pnpm test && pnpm check-types && pnpm lint && pnpm build`
Expected: 모두 PASS — 테스트(Task 1의 5개 신규 포함), 타입, 린트, 빌드.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-07-15-gravitational-lensing-design.md
git commit -m "docs: 중력 렌즈 구현 완료 반영"
```

---

## 실행 후 (계획 밖)

- 브랜치 전체 최종 리뷰(subagent-driven-development의 최종 whole-branch 리뷰, 가장 강한 모델).
- 사람 브라우저 시각 확인(스펙 §8 체크리스트) 후 PR 생성 — 머지는 사용자가 한다.
