import { describe, it, expect } from 'vitest';
import {
  BODY_PRESETS,
  C,
  COLLAPSE_MASS,
  iscoRadius,
  KICK_STRENGTH,
  mergeKickSpeed,
  MIN_RADIUS,
  radiusFromMass,
  schwarzschildRadius,
} from './units';

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
