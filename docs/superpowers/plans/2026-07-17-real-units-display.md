# 실제 단위 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시뮬레이션의 추상 단위 수치(질량·길이·속력·시간)를 친숙한 실제 물리 단위(태양질량·목성질량·지구질량·kg, km·AU, 광속의 %, 초·년)로 표시한다.

**Architecture:** 순수 포매터 모듈 `lib/sim/realunits.ts`가 앵커 상수·스케일과 4개 순수 함수(`formatMass`/`formatLength`/`formatSpeed`/`formatTime`)를 제공한다. UI 3곳(`BodyCard`·`StatsHud`·`SpawnPanel`)이 이 함수들을 호출해 표시만 교체한다. 엔진·물리·씬은 건드리지 않는다.

**Tech Stack:** TypeScript, Vitest(포매터 단위 테스트), React 19 + Tailwind 4(DOM 오버레이).

## Global Constraints

- **표시만 교체, 로직 불변.** 엔진·물리·씬 코드는 수정하지 않는다. 변환은 표시 순간에만 일어난다. 결정론·시뮬레이션 동작 불변. (스펙 §6)
- **원본 추상 숫자는 표시하지 않는다.** 교체 대상 자리에 추상값을 함께 띄우지 않는다. (스펙 §4)
- **앵커는 참조로 파생한다(DRY).** `STAR_MASS`는 `BODY_PRESETS.star.mass`를, `STAR_RADIUS_SIM`은 `radiusFromMass(STAR_MASS)`를, 속력 스케일은 `units.ts`의 `C`를 참조한다. 숫자를 하드코딩 복제하지 않는다. (스펙 §2)
- **슬라이더 값 자체는 추상 질량 그대로 조작한다.** `<input type="range">`의 `min`/`max`/`step`/`value`/`onChange`는 추상 질량을 유지하고, **라벨 문자열만** 실제 단위로 바꾼다. (스펙 §4)
- **단위 토글/설정 UI 없음(YAGNI).** 적응형 자동 선택 하나로 간다. (스펙 §6)
- SI 상수 정확값(스펙 §2): `SOLAR_MASS_KG=1.989e30`, `JUPITER_MASS_KG=1.898e27`, `EARTH_MASS_KG=5.972e24`, `SOLAR_RADIUS_KM=6.96e5`, `AU_KM=1.496e8`, `LIGHT_SPEED_KMS=2.998e5`.

---

## File Structure

- **Create `lib/sim/realunits.ts`** — 앵커 SI 상수, 시뮬 앵커에서 파생한 스케일, 4개 순수 포매터. React·three.js 불포함(엔진 계층 규칙 준수). `./units`에서 `BODY_PRESETS`·`C`·`radiusFromMass`를 import.
- **Create `lib/sim/realunits.test.ts`** — Vitest. 앵커 검증·사다리 경계·시간 접기.
- **Modify `components/ui/BodyCard.tsx`** — 질량·반지름·속력·사건의 지평선·ISCO·증발까지·질량 슬라이더 라벨을 포매터로 교체. 기존 `formatEvaporation` 제거하고 `formatTime` 재사용.
- **Modify `components/ui/StatsHud.tsx`** — 경과 시간을 `formatTime`으로 교체.
- **Modify `components/ui/SpawnPanel.tsx`** — 질량 슬라이더 라벨을 `formatMass`으로, 프리셋 버튼에 실제 질량 부제 추가.

**Task 분할:** Task 1 = 포매터 모듈 + 테스트(자동 검증, TDD). Task 2 = UI 3곳 배선(사람 브라우저 확인). 두 작업은 리뷰 게이트가 독립적이라 분리한다.

---

### Task 1: 실제 단위 포매터 모듈 (`lib/sim/realunits.ts`)

**Files:**
- Create: `lib/sim/realunits.ts`
- Test: `lib/sim/realunits.test.ts`

**Interfaces:**
- Consumes (from `lib/sim/units.ts`, 기존): `BODY_PRESETS` (`.star.mass === 2000`), `C` (`=== 25`), `radiusFromMass(mass: number): number`, `schwarzschildRadius(mass: number): number`.
- Produces (Task 2가 사용):
  - `formatMass(simMass: number): string`
  - `formatLength(simLength: number): string`
  - `formatSpeed(simSpeed: number): string`
  - `formatTime(simSeconds: number): string`
  - 상수 export: `SOLAR_MASS_KG`, `JUPITER_MASS_KG`, `EARTH_MASS_KG`, `SOLAR_RADIUS_KM`, `AU_KM`, `LIGHT_SPEED_KMS`, `STAR_MASS`, `MASS_SCALE_KG`, `STAR_RADIUS_SIM`, `LENGTH_SCALE_KM`, `SPEED_SCALE_KMS`, `TIME_SCALE_S` (테스트·향후 참조용).

**설계 결정(스펙 §3 해석):** 스펙 §3의 유효숫자 괄호 설명("그 미만은 2자리")은 앵커 예시("1.0 태양질량")와 어긋난다. 예시·테스트가 구속력을 가지므로, 질량 유효숫자 헬퍼는 **값 ≥100이면 정수, 1~100이면 소수 1자리, 1 미만이면 소수 2자리**로 정한다. 이러면 `formatMass(2000)="1.0 태양질량"`, `formatMass(3000)="1.5 태양질량"`, `formatMass(20)="10.5 목성질량"`이 모두 성립한다(소행성은 "83.2 지구질량"으로, 스펙의 근사 예시 "83"과 실질 동일).

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/sim/realunits.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { C, radiusFromMass } from './units';
import {
  AU_KM,
  EARTH_MASS_KG,
  formatLength,
  formatMass,
  formatSpeed,
  formatTime,
  JUPITER_MASS_KG,
  LENGTH_SCALE_KM,
  MASS_SCALE_KG,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_KM,
  STAR_MASS,
  STAR_RADIUS_SIM,
} from './realunits';

describe('앵커 스케일', () => {
  it('항성 프리셋 질량이 정확히 1 태양질량이 되도록 스케일이 잡혀 있다', () => {
    expect((STAR_MASS * MASS_SCALE_KG) / SOLAR_MASS_KG).toBeCloseTo(1, 10);
  });

  it('항성 반지름이 정확히 1 태양반지름이 되도록 스케일이 잡혀 있다', () => {
    expect((STAR_RADIUS_SIM * LENGTH_SCALE_KM) / SOLAR_RADIUS_KM).toBeCloseTo(1, 10);
  });
});

describe('formatMass', () => {
  it('항성 프리셋(2000)은 "1.0 태양질량"', () => {
    expect(formatMass(2000)).toBe('1.0 태양질량');
  });

  it('붕괴 임계(3000)는 "1.5 태양질량"', () => {
    expect(formatMass(3000)).toBe('1.5 태양질량');
  });

  it('행성 프리셋(20)은 "10.5 목성질량"', () => {
    expect(formatMass(20)).toBe('10.5 목성질량');
  });

  it('소행성 프리셋(0.5)은 지구질량 단위로 표시된다', () => {
    expect(formatMass(0.5)).toContain('지구질량');
  });

  it('값이 1 이상이 되는 가장 큰 단위를 고른다: 태양↔목성 경계', () => {
    // 1 태양질량 = 2000 시뮬질량. 그 미만은 목성질량 단위.
    expect(formatMass(2000)).toContain('태양질량');
    expect(formatMass(1999)).toContain('목성질량');
  });

  it('값이 1 이상이 되는 가장 큰 단위를 고른다: 목성↔지구 경계', () => {
    // 1 목성질량 = JUPITER_MASS_KG / MASS_SCALE_KG ≈ 1.9085 시뮬질량.
    const oneJupiterSim = JUPITER_MASS_KG / MASS_SCALE_KG;
    expect(formatMass(oneJupiterSim * 1.001)).toContain('목성질량');
    expect(formatMass(oneJupiterSim * 0.999)).toContain('지구질량');
  });

  it('음수 질량도 절댓값으로 처리한다', () => {
    expect(formatMass(-2000)).toBe('1.0 태양질량');
  });
});

describe('formatLength', () => {
  it('항성 반지름은 정확히 "696,000 km" (1 태양반지름)', () => {
    expect(formatLength(radiusFromMass(2000))).toBe('696,000 km');
  });

  it('km는 천 단위 구분 기호를 쓴다', () => {
    expect(formatLength(radiusFromMass(2000))).toMatch(/^[\d,]+ km$/);
  });

  it('1e6 km 이상이면 AU로 전환한다', () => {
    // LENGTH_SCALE_KM ≈ 89060. 12 시뮬길이 ≈ 1.07e6 km → AU, 11 ≈ 9.8e5 km → km.
    expect(formatLength(12)).toContain('AU');
    expect(formatLength(11)).toContain('km');
  });

  it('AU 값은 소수 자리로 표시한다', () => {
    expect(formatLength(12)).toMatch(/^\d+\.\d+ AU$/);
  });
});

describe('formatSpeed', () => {
  it('C(광속)는 "광속의 100%"', () => {
    expect(formatSpeed(C)).toBe('광속의 100%');
  });

  it('공전 속도(√10)는 광속의 % 로 표시된다', () => {
    expect(formatSpeed(Math.sqrt(10))).toContain('광속의');
  });

  it('광속 1%(frac=0.01)에서 %c↔km/s가 전환된다', () => {
    // frac >= 0.01 이면 %c, 미만이면 km/s.
    expect(formatSpeed(0.01 * C)).toContain('광속의');
    expect(formatSpeed(0.009 * C)).toContain('km/s');
  });

  it('느린 천체는 km/s로 표시된다', () => {
    expect(formatSpeed(0.05)).toContain('km/s');
  });
});

describe('formatTime', () => {
  it('짧은 시간은 초', () => {
    expect(formatTime(1)).toContain('초');
  });

  it('분 구간', () => {
    expect(formatTime(50)).toContain('분');
  });

  it('시간 구간', () => {
    expect(formatTime(1000)).toContain('시간');
  });

  it('일 구간', () => {
    expect(formatTime(50000)).toContain('일');
  });

  it('년 구간', () => {
    expect(formatTime(1e7)).toContain('년');
  });

  it('상한을 넘으면 "사실상 영원"', () => {
    expect(formatTime(1e13)).toBe('사실상 영원');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test realunits`
Expected: FAIL — `Cannot find module './realunits'` (또는 export 미정의).

- [ ] **Step 3: 최소 구현 작성**

`lib/sim/realunits.ts`:

```typescript
import { BODY_PRESETS, C, radiusFromMass } from './units';

/**
 * 실제 단위 표시용 앵커·스케일·포매터. 시뮬레이션은 일부러 비물리적 상수(C=25)를 써서
 * 완벽히 자기무결한 실제 단위계는 불가능하다. 대신 몇 개 앵커(항성=태양, 항성 반지름=태양
 * 반지름, C=광속)를 잡아 나머지를 파생시켜 "그럴듯한" 스케일을 준다. 절대 정확성보다 감이
 * 오는 스케일이 목표다(설계 문서 §1). 표시 순간에만 변환하며 엔진 값은 추상 단위 그대로다.
 */

// 실제 상수 (SI).
export const SOLAR_MASS_KG = 1.989e30;
export const JUPITER_MASS_KG = 1.898e27;
export const EARTH_MASS_KG = 5.972e24;
export const SOLAR_RADIUS_KM = 6.96e5;
export const AU_KM = 1.496e8;
export const LIGHT_SPEED_KMS = 2.998e5;

// 시뮬 앵커에서 파생한 스케일. 프리셋·C를 참조하므로 그것들이 바뀌면 스케일이 따라 움직인다.
export const STAR_MASS = BODY_PRESETS.star.mass; // 2000
export const MASS_SCALE_KG = SOLAR_MASS_KG / STAR_MASS; // ≈9.945e26 kg / 시뮬질량 1
export const STAR_RADIUS_SIM = radiusFromMass(STAR_MASS); // ≈7.815
export const LENGTH_SCALE_KM = SOLAR_RADIUS_KM / STAR_RADIUS_SIM; // ≈89,060 km / 시뮬길이 1
export const SPEED_SCALE_KMS = LIGHT_SPEED_KMS / C; // ≈11,992 km/s / 시뮬속력 1
export const TIME_SCALE_S = LENGTH_SCALE_KM / SPEED_SCALE_KMS; // ≈7.43 s / 시뮬시간 1

/** 질량 유효숫자: ≥100 정수, 1~100 소수1자리, <1 소수2자리(설계 문서 §3 해석). */
function formatSig(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

const MASS_UNITS: ReadonlyArray<readonly [number, string]> = [
  [SOLAR_MASS_KG, '태양질량'],
  [JUPITER_MASS_KG, '목성질량'],
  [EARTH_MASS_KG, '지구질량'],
  [1e3, '톤'],
  [1, 'kg'],
];

/** 시뮬 질량 → 값이 1 이상이 되는 가장 큰 친숙 단위 문자열. */
export function formatMass(simMass: number): string {
  const kg = Math.abs(simMass) * MASS_SCALE_KG;
  for (const [scale, label] of MASS_UNITS) {
    const v = kg / scale;
    if (v >= 1) return `${formatSig(v)} ${label}`;
  }
  return `${formatSig(kg)} kg`; // kg 미만(사실상 도달 불가)
}

/** 시뮬 길이 → km(1e6 미만) 또는 AU(1e6 이상). */
export function formatLength(simLength: number): string {
  const km = Math.abs(simLength) * LENGTH_SCALE_KM;
  if (km >= 1e6) return `${(km / AU_KM).toFixed(2)} AU`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** 시뮬 속력 → "광속의 X%"(1% 이상) 또는 km/s(미만). */
export function formatSpeed(simSpeed: number): string {
  const frac = Math.abs(simSpeed) / C;
  if (frac >= 0.01) {
    const pct = frac * 100;
    return `광속의 ${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
  }
  const kms = Math.abs(simSpeed) * SPEED_SCALE_KMS;
  return `${Math.round(kms).toLocaleString('en-US')} km/s`;
}

/** 시뮬 시간(초) → 초·분·시간·일·년으로 접는다. 년>1e6이면 "사실상 영원". */
export function formatTime(simSeconds: number): string {
  const s = Math.abs(simSeconds) * TIME_SCALE_S;
  if (s < 60) return `${s.toFixed(1)}초`;
  if (s < 3600) return `${(s / 60).toFixed(1)}분`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}시간`;
  if (s < 86400 * 365) return `${(s / 86400).toFixed(1)}일`;
  const years = s / (86400 * 365);
  if (years > 1e6) return '사실상 영원';
  return `${years.toFixed(0)}년`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test realunits`
Expected: PASS — 전체 통과.

- [ ] **Step 5: 전체 스위트 회귀 확인**

Run: `pnpm test`
Expected: PASS — 기존 테스트 포함 전부 통과(엔진·물리 미변경이므로 회귀 없어야 함).

- [ ] **Step 6: 커밋**

```bash
git add lib/sim/realunits.ts lib/sim/realunits.test.ts
git commit -m "feat(units): 실제 단위 포매터 모듈 추가"
```

---

### Task 2: UI에 실제 단위 배선 (`BodyCard`·`StatsHud`·`SpawnPanel`)

**Files:**
- Modify: `components/ui/BodyCard.tsx`
- Modify: `components/ui/StatsHud.tsx`
- Modify: `components/ui/SpawnPanel.tsx`

**Interfaces:**
- Consumes (Task 1): `formatMass`, `formatLength`, `formatSpeed`, `formatTime` from `@/lib/sim/realunits`.
- Produces: 없음(표시 계층 종단). 자동 테스트 없음 — 게이트(lint/타입/빌드) + 사람 브라우저 확인으로 검증한다.

**주의(아키텍처 규칙):** 세 파일 모두 `components/ui/`라 three.js·R3F 훅을 import하면 안 된다(변경 없음). 슬라이더의 `min`/`max`/`step`/`value`/`onChange`·`engine.setMass` 호출은 그대로 두고 **라벨 문자열만** 교체한다. 색상·레이아웃·`font-mono text-xs`·`slate/sky` 팔레트 유지(UI 컨벤션).

- [ ] **Step 1: `BodyCard.tsx` — import 교체 및 `formatEvaporation` 제거**

`@/lib/sim/units` import에서 `HAWKING_K`는 유지(증발 시뮬초 계산에 필요), 그 외 블랙홀 함수 유지. 새 import 줄을 추가하고 기존 `formatEvaporation` 함수(34~43줄)를 삭제한다.

import 블록(3~13줄)을 다음으로 만든다:

```typescript
import { useEffect, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';
import {
  BodyType,
  COLLAPSE_MASS,
  HAWKING_K,
  iscoRadius,
  PHOTON_SPHERE_FACTOR,
  schwarzschildRadius,
  timeDilationAt,
} from '@/lib/sim/units';
import { formatLength, formatMass, formatSpeed, formatTime } from '@/lib/sim/realunits';
```

기존 `formatEvaporation` 함수 정의(주석 30~33줄 + 함수 34~43줄)를 통째로 삭제한다. 단, 증발 시뮬초 계산은 아래 Step에서 호출부에 인라인한다.

- [ ] **Step 2: `BodyCard.tsx` — 질량·반지름·속력 표시 교체**

`<dl>` 안의 세 줄(114~125줄)을 교체한다:

```tsx
        <div className="flex justify-between">
          <dt className="text-slate-400">질량</dt>
          <dd>{formatMass(info.mass)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">반지름</dt>
          <dd>{formatLength(info.radius)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">속력</dt>
          <dd>{formatSpeed(info.speed)}</dd>
        </div>
```

- [ ] **Step 3: `BodyCard.tsx` — 블랙홀 사건의 지평선·ISCO·증발까지 교체**

블랙홀 블록(128~139줄)의 세 줄을 교체한다. 사건의 지평선·ISCO는 `formatLength`, 증발까지는 `formatTime`에 증발 시뮬초(`mass³/(3·HAWKING_K)`)를 넘긴다:

```tsx
            <div className="flex justify-between">
              <dt className="text-slate-400">사건의 지평선</dt>
              <dd>{formatLength(schwarzschildRadius(info.mass))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-amber-300/70">흡수 반경 (ISCO)</dt>
              <dd className="text-amber-200">{formatLength(iscoRadius(info.mass))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">증발까지</dt>
              <dd>{formatTime((info.mass * info.mass * info.mass) / (3 * HAWKING_K))}</dd>
            </div>
```

시간 지연(140~151줄, 광자 구/ISCO `×`)은 무차원이라 **변경하지 않는다**.

- [ ] **Step 4: `BodyCard.tsx` — 질량 슬라이더 라벨 교체**

슬라이더 라벨(162~167줄)의 `info.mass.toFixed(1)`을 `formatMass(info.mass)`로 바꾼다. `<input type="range">`(168~180줄)와 `붕괴 임박` 스팬은 그대로:

```tsx
      <label className="mt-3 mb-1 block font-mono text-xs text-sky-200/70">
        질량 {formatMass(info.mass)}
        {!info.blackHole && info.mass >= COLLAPSE_MASS * 0.9 && (
          <span className="ml-2 text-amber-300">붕괴 임박</span>
        )}
      </label>
```

- [ ] **Step 5: `StatsHud.tsx` — 경과 시간 교체**

import에 `formatTime`을 추가하고, 경과 시간 줄(18~20줄)에서 `stats.simTime.toFixed(1)` + `s`를 `formatTime(stats.simTime)`으로 바꾼다.

import 블록(3~4줄):

```typescript
import { useSimulation } from '@/state/SimulationProvider';
import { MAX_BODIES } from '@/lib/sim/units';
import { formatTime } from '@/lib/sim/realunits';
```

경과 줄(18~20줄)을 다음으로:

```tsx
        <span>
          경과 <span className="text-sky-300">{formatTime(stats.simTime)}</span>
        </span>
```

(끝의 리터럴 `s`는 제거한다 — `formatTime`이 단위를 포함한다.)

- [ ] **Step 6: `SpawnPanel.tsx` — 질량 슬라이더 라벨 + 프리셋 부제 교체**

import에 `formatMass`를 추가한다:

```typescript
import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';
import { formatMass } from '@/lib/sim/realunits';
import { SCATTER_MAX, SCATTER_MIN, useSimulation } from '@/state/SimulationProvider';
```

프리셋 버튼(28~41줄)에 실제 질량 부제를 추가한다. 버튼 내용을 라벨 + 부제 2줄로 만든다:

```tsx
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
            <div>{BODY_PRESETS[k].label}</div>
            <div className="mt-0.5 font-mono text-[10px] leading-tight opacity-70">
              {formatMass(BODY_PRESETS[k].mass)}
            </div>
          </button>
        ))}
```

질량 슬라이더 라벨(44~46줄)의 `spawnMass.toFixed(1)`을 `formatMass(spawnMass)`로 바꾼다. `<input>`(47~55줄)은 그대로:

```tsx
      <label className="mb-1 block font-mono text-xs text-sky-200/70">
        질량 {formatMass(spawnMass)}
      </label>
```

- [ ] **Step 7: 게이트 — 타입·린트·테스트·빌드**

Run: `pnpm check-types`
Expected: PASS — 타입 오류 없음.

Run: `pnpm lint`
Expected: PASS — 린트 오류 없음.

Run: `pnpm test`
Expected: PASS — 전체 스위트 통과(엔진·물리 미변경).

Run: `pnpm build`
Expected: PASS — 프로덕션 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add components/ui/BodyCard.tsx components/ui/StatsHud.tsx components/ui/SpawnPanel.tsx
git commit -m "feat(ui): 카드·통계·스폰 패널에 실제 단위 표시 배선"
```

- [ ] **Step 9: 사람 브라우저 확인(자동화 불가, 스펙 §8)**

`pnpm dev` 후 다음을 확인한다(구현자는 체크리스트만 보고하고, 실제 확인은 사람이 한다):
- 천체 선택 시 카드의 질량·반지름·속력이 친숙한 단위로 뜨는가(항성 "1.0 태양질량", 반지름 "696,000 km").
- 블랙홀 카드의 사건의 지평선·ISCO가 km/AU로, 증발까지가 실제 시간으로 뜨는가.
- 공전 천체 속력이 "광속의 X%"로, 느린 천체는 km/s로 뜨는가.
- 상단 경과 시간이 실제 시간 단위로 뜨는가.
- 스폰 패널의 질량 슬라이더 라벨·프리셋 부제가 실제 질량으로 뜨는가.
- 숫자가 한눈에 읽히는 범위(너무 길거나 0.000… 아님)인가.

---

## Self-Review

**1. 스펙 커버리지:**
- §2 앵커 상수·스케일 → Task 1 Step 3(상수 export) + Step 1(앵커 검증 테스트). ✓
- §3 4개 포매터 → Task 1 전체. ✓
- §4 적용 범위(BodyCard 질량/반지름/속력/지평선/ISCO/증발/슬라이더, StatsHud 경과, SpawnPanel 슬라이더/부제) → Task 2 Step 2~6. ✓
- §5 파일·테스트 → Task 1(파일 2개 생성 + 테스트), Task 2(UI 3곳 수정). ✓
- §6 비목표(엔진 불변, 토글 없음) → Global Constraints에 명시. ✓
- §8 사람 확인 → Task 2 Step 9. ✓

**2. 플레이스홀더 스캔:** TBD/TODO 없음. 모든 코드 스텝에 완전한 코드 포함. ✓

**3. 타입 일관성:** Task 1이 export하는 `formatMass`/`formatLength`/`formatSpeed`/`formatTime` 시그니처(모두 `(number): string`)를 Task 2가 그대로 사용. `HAWKING_K`는 `units.ts`에서 계속 import(증발 시뮬초 계산). 슬라이더 `engine.setMass`·`min/max/step` 미변경. ✓

**해소한 스펙 내부 모순:** §3 유효숫자 괄호("<10 → 2자리")가 앵커 예시 "1.0 태양질량"과 충돌 → Task 1 설계 결정에서 "1~100 소수1자리"로 확정(테스트가 구속). 소행성 표시는 스펙 근사 예시 "83 지구질량" 대신 "83.2 지구질량"이 되며 실질 동일.
