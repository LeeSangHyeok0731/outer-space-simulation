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
