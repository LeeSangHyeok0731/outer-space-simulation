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
