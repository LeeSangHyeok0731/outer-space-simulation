import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { resolveCollisions } from './collisions';

describe('resolveCollisions', () => {
  it('겹치지 않으면 아무 일도 일어나지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: -10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1 });
    b.add({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1 });
    expect(resolveCollisions(b)).toBe(false);
    expect(b.count).toBe(2);
  });

  it('질량과 운동량을 보존하며 하나로 합친다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 4, vy: 0, vz: 0, mass: 3, radius: 2 });
    b.add({ x: 1, y: 0, z: 0, vx: -2, vy: 0, vz: 0, mass: 1, radius: 2 });

    const pxBefore = 3 * 4 + 1 * -2; // 10
    expect(resolveCollisions(b)).toBe(true);

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeCloseTo(4, 10);
    expect(b.mass[0] * b.velX[0]).toBeCloseTo(pxBefore, 10);
    expect(b.velX[0]).toBeCloseTo(2.5, 10);
  });

  it('반지름은 부피 보존으로 합쳐진다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 3 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 4 });
    resolveCollisions(b);
    expect(b.radius[0]).toBeCloseTo(Math.cbrt(27 + 64), 10);
  });

  it('같은 질량이 반대 속도로 정면충돌하면 정지한 하나가 된다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: -0.5, y: 0, z: 0, vx: 5, vy: 0, vz: 0, mass: 10, radius: 1 });
    b.add({ x: 0.5, y: 0, z: 0, vx: -5, vy: 0, vz: 0, mass: 10, radius: 1 });
    resolveCollisions(b);
    expect(b.count).toBe(1);
    expect(b.velX[0]).toBeCloseTo(0, 10);
    expect(b.mass[0]).toBeCloseTo(20, 10);
  });

  it('무거운 쪽의 id와 색을 물려받는다', () => {
    const b = new BodyBuffer(4);
    const smallId = b.add({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2,
      color: [1, 0, 0],
    });
    const bigId = b.add({
      x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 2,
      color: [0, 0, 1],
    });
    resolveCollisions(b);
    expect(b.id[0]).toBe(bigId);
    expect(b.id[0]).not.toBe(smallId);
    expect(b.colB[0]).toBeCloseTo(1, 5);
  });

  it('세 천체가 한 덩어리로 겹쳐 있으면 하나로 합쳐진다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    b.add({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 2 });
    resolveCollisions(b);
    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeCloseTo(3, 10);
  });
});
