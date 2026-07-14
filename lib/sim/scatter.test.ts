import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import { RING_INNER, RING_OUTER, scatterChaotic, scatterOrbital, type Rng } from './scatter';
import { G, MAX_BODIES } from './units';

/** 시드 고정 PRNG. 난수를 주입받기 때문에 뿌리기도 결정론적으로 검증할 수 있다. */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPTS = { count: 40, mass: 1, color: [1, 1, 1] as [number, number, number] };

/** 항성 하나만 있는 우주 */
function withStar(mass = 2000): SimulationEngine {
  const e = new SimulationEngine();
  e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass });
  return e;
}

describe('scatterOrbital', () => {
  it('요청한 개수만큼 뿌린다', () => {
    const e = withStar();
    const spawned = scatterOrbital(e, OPTS, mulberry32(1));
    expect(spawned).toBe(40);
    expect(e.bodies.count).toBe(41); // 항성 + 40
  });

  it('512개 상한에 걸리면 남은 만큼만 뿌리고 멈춘다', () => {
    const e = new SimulationEngine();
    for (let i = 0; i < MAX_BODIES - 10; i++) {
      e.spawn({ position: [i * 0.001, 0, 0], velocity: [0, 0, 0], mass: 1 });
    }
    const spawned = scatterOrbital(e, { ...OPTS, count: 100 }, mulberry32(2));
    expect(spawned).toBe(10);
    expect(e.bodies.count).toBe(MAX_BODIES);
  });

  it('고리 밴드 안에, 황도면 근처에 놓인다', () => {
    const e = withStar();
    scatterOrbital(e, OPTS, mulberry32(3));

    for (let i = 1; i < e.bodies.count; i++) {
      const r = Math.hypot(e.bodies.posX[i], e.bodies.posZ[i]);
      expect(r).toBeGreaterThanOrEqual(RING_INNER);
      expect(r).toBeLessThanOrEqual(RING_OUTER);
      expect(Math.abs(e.bodies.posY[i])).toBeLessThanOrEqual(6);
    }
  });

  it('속력이 원궤도 속도 근처다 (난도를 감안해 ±10% 이내)', () => {
    const M = 2000;
    const e = withStar(M);
    scatterOrbital(e, OPTS, mulberry32(4));

    for (let i = 1; i < e.bodies.count; i++) {
      const r = Math.hypot(e.bodies.posX[i], e.bodies.posY[i], e.bodies.posZ[i]);
      const expected = Math.sqrt((G * M) / r);
      const speed = Math.hypot(e.bodies.velX[i], e.bodies.velY[i], e.bodies.velZ[i]);
      expect(Math.abs(speed - expected) / expected).toBeLessThan(0.1);
    }
  });

  it('중심 천체가 움직이고 있으면 그 속도를 함께 물려받는다', () => {
    const e = new SimulationEngine();
    e.spawn({ position: [0, 0, 0], velocity: [10, 0, 0], mass: 2000 });
    scatterOrbital(e, OPTS, mulberry32(5));

    // 뿌려진 천체들의 평균 속도가 중심의 속도를 따라가야 한다.
    // (궤도 속도는 방향이 고르게 분포하므로 평균에서 상쇄된다.)
    let sum = 0;
    for (let i = 1; i < e.bodies.count; i++) sum += e.bodies.velX[i];
    expect(sum / (e.bodies.count - 1)).toBeGreaterThan(5);
  });

  it('빈 우주에서는 정지한 고리를 놓는다 (서로 끌어당겨 붕괴한다)', () => {
    const e = new SimulationEngine();
    const spawned = scatterOrbital(e, OPTS, mulberry32(6));

    expect(spawned).toBe(40);
    for (let i = 0; i < e.bodies.count; i++) {
      expect(Math.hypot(e.bodies.velX[i], e.bodies.velY[i], e.bodies.velZ[i])).toBe(0);
    }
  });

  it('질량은 기준 질량의 0.5~1.5배 사이에서 흩어진다', () => {
    const e = withStar();
    scatterOrbital(e, { ...OPTS, mass: 10 }, mulberry32(7));

    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < e.bodies.count; i++) {
      expect(e.bodies.mass[i]).toBeGreaterThanOrEqual(5);
      expect(e.bodies.mass[i]).toBeLessThanOrEqual(15);
      min = Math.min(min, e.bodies.mass[i]);
      max = Math.max(max, e.bodies.mass[i]);
    }
    expect(max).toBeGreaterThan(min); // 전부 같은 질량이면 난도가 안 걸린 것이다
  });

  it('같은 시드는 같은 결과를 낸다 (결정론)', () => {
    const a = withStar();
    const b = withStar();
    scatterOrbital(a, OPTS, mulberry32(42));
    scatterOrbital(b, OPTS, mulberry32(42));

    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posX[i]).toBe(b.bodies.posX[i]);
      expect(a.bodies.velZ[i]).toBe(b.bodies.velZ[i]);
      expect(a.bodies.mass[i]).toBe(b.bodies.mass[i]);
    }
  });
});

describe('scatterChaotic', () => {
  it('요청한 개수만큼 뿌리고, 상한을 넘지 않는다', () => {
    const e = withStar();
    expect(scatterChaotic(e, OPTS, mulberry32(8))).toBe(40);
    expect(e.bodies.count).toBe(41);
  });

  it('위치와 속도 방향이 3차원 전체로 흩어진다 (평면에 갇히지 않는다)', () => {
    const e = withStar();
    scatterChaotic(e, { ...OPTS, count: 60 }, mulberry32(9));

    let offPlane = 0;
    for (let i = 1; i < e.bodies.count; i++) {
      if (Math.abs(e.bodies.posY[i]) > 20) offPlane++;
    }
    expect(offPlane).toBeGreaterThan(10); // 구 전체에 뿌려지므로 상당수가 평면 밖에 있다
  });

  it('유한한 값만 만든다 (중심에 너무 가까워도 속도가 발산하지 않는다)', () => {
    const e = withStar();
    scatterChaotic(e, { ...OPTS, count: 100 }, mulberry32(10));

    for (let i = 0; i < e.bodies.count; i++) {
      expect(Number.isFinite(e.bodies.posX[i])).toBe(true);
      expect(Number.isFinite(e.bodies.velX[i])).toBe(true);
      expect(Number.isFinite(e.bodies.velY[i])).toBe(true);
      expect(Number.isFinite(e.bodies.velZ[i])).toBe(true);
    }
  });

  it('빈 우주에서도 터지지 않는다', () => {
    const e = new SimulationEngine();
    expect(scatterChaotic(e, OPTS, mulberry32(11))).toBe(40);
    for (let i = 0; i < e.bodies.count; i++) {
      expect(Number.isFinite(e.bodies.velX[i])).toBe(true);
    }
  });

  it('같은 시드는 같은 결과를 낸다 (결정론)', () => {
    const a = withStar();
    const b = withStar();
    scatterChaotic(a, OPTS, mulberry32(99));
    scatterChaotic(b, OPTS, mulberry32(99));

    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posY[i]).toBe(b.bodies.posY[i]);
      expect(a.bodies.velX[i]).toBe(b.bodies.velX[i]);
    }
  });
});
