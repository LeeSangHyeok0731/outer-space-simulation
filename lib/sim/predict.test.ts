import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { predictTrajectory } from './predict';
import { G } from './units';

describe('predictTrajectory', () => {
  it('원궤도 속도로 쏘면 예측 궤적이 원을 그린다', () => {
    const b = new BodyBuffer(4);
    const M = 1000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: M, radius: 2 });

    const r = 100;
    const v = Math.sqrt((G * M) / r);
    const out = new Float32Array(400 * 3);
    const n = predictTrajectory(b, [r, 0, 0], [0, 0, v], out, 1 / 60);

    expect(n).toBe(400);
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      expect(Math.abs(d - r) / r).toBeLessThan(0.02);
    }
  });

  it('천체에 충돌하면 궤적이 거기서 끊긴다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 10 });

    const out = new Float32Array(400 * 3);
    // 정지 상태로 놓으면 곧바로 중심 천체로 떨어진다
    const n = predictTrajectory(b, [20, 0, 0], [0, 0, 0], out, 1 / 60);

    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(400);
  });

  it('중력원이 없으면 직선이다', () => {
    const b = new BodyBuffer(4);
    const out = new Float32Array(10 * 3);
    const n = predictTrajectory(b, [0, 0, 0], [1, 0, 0], out, 1);

    expect(n).toBe(10);
    expect(out[0]).toBeCloseTo(1, 5);   // 1스텝 뒤 x=1
    expect(out[3 * 3]).toBeCloseTo(4, 5); // 4스텝 뒤 x=4
  });
});
