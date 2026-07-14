import type { SimulationEngine } from './engine';
import { G } from './units';

/**
 * 난수 생성기. 호출자가 주입한다.
 *
 * `Math.random`을 이 모듈 안에서 직접 부르면 lib/sim 전체가 비결정적이 되어
 * 엔진의 결정론 보장(같은 입력 → 같은 결과)이 깨진다. UI는 `Math.random`을 넘기고,
 * 테스트는 시드 고정 PRNG를 넘긴다.
 */
export type Rng = () => number;

/** 고리 뿌리기의 반지름 밴드. 시작 항성계(행성 60~155, 소행성 띠 200~230)를 감싸는 범위다. */
export const RING_INNER = 120;
export const RING_OUTER = 320;

/** 혼돈 뿌리기가 천체를 흩뿌리는 구의 반지름. */
export const CHAOS_RADIUS = 350;

/** 고리를 완전한 평면으로 두지 않기 위한 y축 흩뿌림. */
const Y_JITTER = 5;

/**
 * 궤도 속도에 섞는 난도. 완벽한 원궤도만 놓으면 서로 영원히 스치지 않아 아무 일도
 * 일어나지 않는다. 어긋나야 부딪히고, 부딪혀야 뭉친다.
 */
const SPEED_JITTER = 0.05; // ±5%
const ANGLE_JITTER = (3 * Math.PI) / 180; // ±3°

/** 질량 난도: 기준 질량의 0.5~1.5배. */
const MASS_JITTER = 0.5;

export interface ScatterOptions {
  count: number;
  /** 기준 질량. 패널에서 고른 값이 그대로 들어온다. */
  mass: number;
  color: [number, number, number];
}

/** 가장 무거운 천체의 인덱스. 우주가 비어 있으면 -1. */
function findPrimary(engine: SimulationEngine): number {
  const b = engine.bodies;
  let best = -1;
  let bestMass = -Infinity;
  for (let i = 0; i < b.count; i++) {
    if (b.mass[i] > bestMass) {
      bestMass = b.mass[i];
      best = i;
    }
  }
  return best;
}

function remainingCapacity(engine: SimulationEngine): number {
  return engine.bodies.capacity - engine.bodies.count;
}

/** 기준 질량 주위로 흩어진 질량. 항상 양수다. */
function jitteredMass(base: number, rng: Rng): number {
  const factor = 1 - MASS_JITTER + rng() * 2 * MASS_JITTER;
  return Math.max(base * factor, 1e-3);
}

/**
 * 가장 무거운 천체를 중심으로 고리 모양으로 뿌린다. 각 천체는 그 중심에 대한
 * 원궤도 속도에 약간의 난도를 섞어 받으므로, 살아남아 공전하다가 서로 스치고 뭉친다.
 *
 * 우주가 비어 있으면(중심이 없으면) 정지한 고리를 놓는다 — 서로 끌어당겨 안쪽으로
 * 붕괴하며 하나의 큰 천체가 된다.
 *
 * @returns 실제로 뿌려진 개수. 512개 상한에 걸리면 요청보다 적을 수 있다.
 */
export function scatterOrbital(
  engine: SimulationEngine,
  opts: ScatterOptions,
  rng: Rng,
): number {
  const n = Math.min(opts.count, remainingCapacity(engine));
  if (n <= 0) return 0;

  const b = engine.bodies;
  const p = findPrimary(engine);

  const cx = p === -1 ? 0 : b.posX[p];
  const cy = p === -1 ? 0 : b.posY[p];
  const cz = p === -1 ? 0 : b.posZ[p];
  const cvx = p === -1 ? 0 : b.velX[p];
  const cvy = p === -1 ? 0 : b.velY[p];
  const cvz = p === -1 ? 0 : b.velZ[p];
  const M = p === -1 ? 0 : b.mass[p];

  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const r = RING_INNER + rng() * (RING_OUTER - RING_INNER);
    const theta = rng() * Math.PI * 2;
    const y = (rng() * 2 - 1) * Y_JITTER;

    let vx = cvx;
    const vy = cvy;
    let vz = cvz;

    if (M > 0) {
      // 접선 방향에 각도 난도를 준다. 완전한 접선이면 궤도가 너무 얌전하다.
      const dir = theta + Math.PI / 2 + (rng() * 2 - 1) * ANGLE_JITTER;
      const speed = Math.sqrt((G * M) / r) * (1 + (rng() * 2 - 1) * SPEED_JITTER);
      vx += Math.cos(dir) * speed;
      vz += Math.sin(dir) * speed;
    } else {
      // 중심이 없으면 난수 소비량을 맞추기 위해 두 번 뽑아 버린다.
      // (이래야 같은 시드가 우주 상태와 무관하게 같은 배치를 낸다.)
      rng();
      rng();
    }

    const id = engine.spawn({
      position: [cx + Math.cos(theta) * r, cy + y, cz + Math.sin(theta) * r],
      velocity: [vx, vy, vz],
      mass: jitteredMass(opts.mass, rng),
      color: opts.color,
    });
    if (id === -1) break;
    spawned++;
  }

  return spawned;
}

/**
 * 구 안에 위치도 속도도 마구잡이로 뿌린다. 대부분은 중심에 빨려들거나 우주 밖으로
 * 튕겨 나간다 — 그게 목적이다.
 *
 * @returns 실제로 뿌려진 개수.
 */
export function scatterChaotic(
  engine: SimulationEngine,
  opts: ScatterOptions,
  rng: Rng,
): number {
  const n = Math.min(opts.count, remainingCapacity(engine));
  if (n <= 0) return 0;

  const b = engine.bodies;
  const p = findPrimary(engine);

  const cx = p === -1 ? 0 : b.posX[p];
  const cy = p === -1 ? 0 : b.posY[p];
  const cz = p === -1 ? 0 : b.posZ[p];
  const M = p === -1 ? 0 : b.mass[p];

  /** 중심에 아주 가까울 때 √(GM/r)이 발산하는 것을 막는 하한. */
  const MIN_R = 20;
  /** 중심이 없을 때 쓰는 기준 속력. */
  const FALLBACK_SPEED = 3;

  let spawned = 0;
  for (let i = 0; i < n; i++) {
    // 구 안에 고르게: 반지름은 세제곱근으로 뽑아야 껍질에 몰리지 않는다.
    const r = Math.max(CHAOS_RADIUS * Math.cbrt(rng()), MIN_R);
    const [ux, uy, uz] = randomDirection(rng);

    const scale = M > 0 ? Math.sqrt((G * M) / r) : FALLBACK_SPEED;
    const speed = rng() * 1.5 * scale;
    const [dx, dy, dz] = randomDirection(rng);

    const id = engine.spawn({
      position: [cx + ux * r, cy + uy * r, cz + uz * r],
      velocity: [dx * speed, dy * speed, dz * speed],
      mass: jitteredMass(opts.mass, rng),
      color: opts.color,
    });
    if (id === -1) break;
    spawned++;
  }

  return spawned;
}

/** 구면 위에 고르게 분포하는 단위 벡터. z를 균등하게 뽑아야 극에 몰리지 않는다. */
function randomDirection(rng: Rng): [number, number, number] {
  const z = rng() * 2 - 1;
  const phi = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(phi), z, s * Math.sin(phi)];
}
