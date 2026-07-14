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
