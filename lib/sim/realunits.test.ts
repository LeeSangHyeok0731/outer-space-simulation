import { describe, expect, it } from 'vitest';
import { C, radiusFromMass } from './units';
import {
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
