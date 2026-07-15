/** 중력 상수. SI 단위는 부동소수점 정밀도만 낭비하므로 G=1인 추상 단위를 쓴다. */
export const G = 1;

/** 중력 소프트닝. 두 천체가 겹칠 때 1/r²이 폭발하는 것을 막는다. */
export const SOFTENING = 0.5;

/** 동시 천체 수 상한. InstancedMesh 인스턴스 수와 같다. */
export const MAX_BODIES = 512;

/** 모든 천체의 밀도는 일정하다고 가정한다. 따라서 r ∝ ∛m. */
export const DENSITY = 1;

/** 화면에서 보이지 않을 만큼 작아지는 것을 막는 하한. */
export const MIN_RADIUS = 0.3;

export const BodyType = {
  NORMAL: 0,
  BLACK_HOLE: 1,
  SHIP: 2,
} as const;

export type PresetKey = 'asteroid' | 'planet' | 'star';

export const BODY_PRESETS: Record<
  PresetKey,
  { label: string; mass: number; color: [number, number, number] }
> = {
  asteroid: { label: '소행성', mass: 0.5, color: [0.55, 0.62, 0.75] },
  planet: { label: '행성', mass: 20, color: [0.25, 0.75, 1.0] },
  star: { label: '항성', mass: 2000, color: [1.0, 0.72, 0.28] },
};

/** 구의 부피 공식을 뒤집는다: m = ρ·(4/3)πr³ */
export function radiusFromMass(mass: number): number {
  const r = Math.cbrt((3 * Math.abs(mass)) / (4 * Math.PI * DENSITY));
  return Math.max(r, MIN_RADIUS);
}

/**
 * 시뮬레이션 광속. 블랙홀의 모든 것이 이 상수 하나에서 파생된다.
 *
 * 실제 c(3e8 m/s)를 쓰면 태양질량 블랙홀의 사건의 지평선이 3km — 별 크기에 비해
 * 점에 불과해 화면에 보이지도, 아무것도 삼키지도 못한다. C를 작게 잡는다는 것은
 * "우리 우주는 빛이 느리다"고 정하는 것이고, 그 대가로 블랙홀이 손에 잡히는 크기가 된다.
 */
export const C = 25;

/**
 * 자동 붕괴 임계 질량. 이 이상이면 스스로 무너져 블랙홀이 된다.
 *
 * 찬드라세카르 한계(전자 축퇴압의 한계)와 TOV 한계(중성자 축퇴압의 한계)의 번안이다 —
 * "더 이상 버틸 브레이크가 없다"는 진짜 원리가 그대로 게임 규칙이 된다.
 * 항성 프리셋(2000) 둘을 충돌시키면 넘는 값이라, 발견 가능하고 극적이다.
 */
export const COLLAPSE_MASS = 3000;

/** 호킹 복사 계수. dM/dt = -HAWKING_K / M² — 작을수록 미친 듯이 빨리 증발한다. */
export const HAWKING_K = 0.2;

/** 증발하는 블랙홀이 이 질량 아래로 떨어지면 소멸시킨다. */
export const EVAPORATION_FLOOR = 0.01;

/**
 * 사건의 지평선 반지름. `r_s = 2GM/c²`
 *
 * 질량에 **정비례**한다는 것이 핵심이다. 일반 천체의 반지름은 `∛m`으로 굼뜨게 자라는데
 * (밀도 일정 가정, `radiusFromMass` 참고), 블랙홀은 먹을수록 흡수 반경이 선형으로 커진다.
 * 폭주 성장은 규칙으로 만든 것이 아니라 이 식에서 저절로 나온다.
 *
 * `MIN_RADIUS` 하한을 걸지 않는다 — 작은 블랙홀은 실제로 작고, 어차피 곧 증발한다.
 */
export function schwarzschildRadius(mass: number): number {
  return (2 * G * Math.abs(mass)) / (C * C);
}

/**
 * 최내부 안정 원궤도(ISCO) 반지름. 슈바르츠실트 블랙홀에서는 `3 r_s`다.
 *
 * **이 안쪽에는 안정 궤도가 존재하지 않는다.** 뉴턴 중력에서는 아무리 가까워도 빠르기만
 * 하면 궤도를 돌 수 있지만, 실제 블랙홀 근처에서는 어떤 속도로도 궤도를 유지할 수 없고
 * 나선을 그리며 빨려든다. 이 한 줄이 "블랙홀은 무거운 항성과 무엇이 다른가"에 대한 답이며,
 * 이 값이 곧 흡수 반경이 된다.
 */
export function iscoRadius(mass: number): number {
  return 3 * schwarzschildRadius(mass);
}

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
