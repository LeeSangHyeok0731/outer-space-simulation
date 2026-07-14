import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { computeAccelerations, integrate } from './integrator';
import { G } from './units';

/** 무거운 중심 천체 + 무시할 만큼 가벼운 위성. 위성은 XZ 평면에서 원궤도를 돈다. */
function circularPair(centralMass: number, r: number) {
  const b = new BodyBuffer(4);
  b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: centralMass, radius: 1 });
  const v = Math.sqrt((G * centralMass) / r);
  b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: v, mass: 1e-6, radius: 0.1 });
  computeAccelerations(b);
  return b;
}

describe('computeAccelerations', () => {
  it('서로를 끌어당긴다 (뉴턴 3법칙: 힘의 크기가 같고 방향이 반대)', () => {
    const b = new BodyBuffer(2);
    b.add({ x: -10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5, radius: 1 });
    b.add({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5, radius: 1 });
    computeAccelerations(b);
    expect(b.accX[0]).toBeGreaterThan(0); // 0번은 +x(상대)를 향해
    expect(b.accX[1]).toBeLessThan(0);    // 1번은 -x를 향해
    // 질량이 같으므로 가속도 크기도 같다
    expect(b.accX[0]).toBeCloseTo(-b.accX[1], 10);
    // 힘 = m·a 의 총합은 0
    const fx = b.mass[0] * b.accX[0] + b.mass[1] * b.accX[1];
    expect(fx).toBeCloseTo(0, 10);
  });

  it('겹친 두 천체에서도 소프트닝 덕분에 유한한 값이 나온다', () => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 1 });
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 1 });
    computeAccelerations(b);
    expect(Number.isFinite(b.accX[0])).toBe(true);
    expect(Number.isFinite(b.accY[0])).toBe(true);
    expect(Number.isFinite(b.accZ[0])).toBe(true);
  });
});

describe('integrate (립프로그)', () => {
  it('원궤도를 100바퀴 돌아도 반지름이 1% 이내로 유지된다', () => {
    const M = 1000;
    const r0 = 100;
    const b = circularPair(M, r0);

    const period = 2 * Math.PI * Math.sqrt((r0 * r0 * r0) / (G * M));
    const dt = 1 / 120;
    const steps = Math.round((100 * period) / dt);

    for (let s = 0; s < steps; s++) integrate(b, dt);

    const r = Math.hypot(b.posX[1] - b.posX[0], b.posY[1] - b.posY[0], b.posZ[1] - b.posZ[0]);
    expect(Math.abs(r - r0) / r0).toBeLessThan(0.01);
  });

  it('중력이 없는 단일 천체는 등속 직선 운동한다', () => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0, mass: 1, radius: 1 });
    computeAccelerations(b);
    for (let s = 0; s < 100; s++) integrate(b, 0.01);
    expect(b.posX[0]).toBeCloseTo(2, 6);
  });
});
