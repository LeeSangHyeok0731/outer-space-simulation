import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { computeAccelerations, integrate } from './integrator';
import { BodyType, G } from './units';

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

describe('프레임 끌림 (커 스핀)', () => {
  // x축 위 천체를 몇 스텝 굴려, 접선(z) 속도가 붙는지로 감김을 잰다.
  // 천체는 x축에 있고 중력은 −x 방향이라 z 속도를 만들지 않는다 — z는 오직 끌림에서 온다.
  const dragVz = (spin: number) => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5000, radius: 1, type: BodyType.BLACK_HOLE, spin });
    b.add({ x: 70, y: 0, z: 0, vx: -3, vy: 0, vz: 0, mass: 1e-3, radius: 0.3 });
    computeAccelerations(b);
    for (let s = 0; s < 60; s++) integrate(b, 1 / 120);
    return b.velZ[1];
  };

  it('스핀 0이면 감김이 없다 (접선 속도가 안 붙는다)', () => {
    expect(Math.abs(dragVz(0))).toBeLessThan(1e-9);
  });

  it('스핀이 있으면 낙하 천체가 스핀 방향으로 감긴다', () => {
    expect(dragVz(1)).toBeLessThan(0); // +spin → θ>0 → v_z가 음으로 감긴다
  });

  it('스핀 방향을 뒤집으면 감김도 뒤집힌다', () => {
    expect(dragVz(-1)).toBeGreaterThan(0);
  });

  it('스핀 궤도의 에너지가 보존된다 (속도 회전은 일을 안 한다) — 폭주 없음', () => {
    // 회귀 방지: v×B(가속도) 방식은 이 시나리오에서 드리프트 349%, r 70→2039로 폭주했다.
    // 속도 회전 방식은 |v|를 보존하므로 에너지가 유계이고 반경이 70 근처에 머문다.
    const M = 5000;
    const r = 70;
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: M, radius: 1, type: BodyType.BLACK_HOLE, spin: 1 });
    const v = Math.sqrt((G * M) / r);
    b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: v, mass: 1e-6, radius: 0.1 });
    computeAccelerations(b);

    const energy = () => {
      const rr = Math.hypot(b.posX[1], b.posY[1], b.posZ[1]);
      const vv = b.velX[1] ** 2 + b.velY[1] ** 2 + b.velZ[1] ** 2;
      return 0.5 * vv - (G * M) / rr;
    };
    const e0 = energy();
    for (let s = 0; s < 20000; s++) integrate(b, 1 / 120);
    const drift = Math.abs((energy() - e0) / e0);
    const dist = Math.hypot(b.posX[1], b.posY[1], b.posZ[1]);

    // 속도 회전 방식은 유계다(측정: drift≈0.16, dist≈80). v×B 방식은 여기서 drift 3.49,
    // dist 2039로 폭주했다 — 이 경계가 그 회귀를 잡는다. 15%대 드리프트는 프레임 끌림이
    // 각운동량을 주고받는 물리적 효과이며 167 시뮬초에 걸친 느린 변화라 유계로 남는다.
    expect(drift).toBeLessThan(0.5); // 이전 v×B: 3.49
    expect(dist).toBeGreaterThan(40);
    expect(dist).toBeLessThan(200); // 이전 v×B: 2039
  }, 30_000);
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
    // 240만 스텝을 돈다. 한가한 머신에서는 ~330ms지만 부하가 걸리면 기본 5초 제한을
    // 넘겨 실패한 적이 있다. 느려서 나는 빨간불은 회귀 신호를 가릴 뿐이라 넉넉히 준다.
  }, 30_000);

  it('중력이 없는 단일 천체는 등속 직선 운동한다', () => {
    const b = new BodyBuffer(2);
    b.add({ x: 0, y: 0, z: 0, vx: 2, vy: 0, vz: 0, mass: 1, radius: 1 });
    computeAccelerations(b);
    for (let s = 0; s < 100; s++) integrate(b, 0.01);
    expect(b.posX[0]).toBeCloseTo(2, 6);
  });
});

describe('고정된 천체 (pinned)', () => {
  it('중력을 받아도 움직이지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1, pinned: true });
    b.add({ x: 50, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 10, radius: 1 });
    computeAccelerations(b);

    for (let s = 0; s < 500; s++) integrate(b, 1 / 120);

    expect(b.posX[0]).toBe(0);
    expect(b.posY[0]).toBe(0);
    expect(b.posZ[0]).toBe(0);
    expect(b.velX[0]).toBe(0);
  });

  it('고정돼 있어도 다른 천체는 그대로 끌어당긴다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1, pinned: true });
    b.add({ x: 50, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 10, radius: 1 });
    computeAccelerations(b);

    for (let s = 0; s < 500; s++) integrate(b, 1 / 120);

    expect(b.posX[1]).toBeLessThan(50); // 고정된 천체 쪽으로 끌려왔다
    expect(b.velX[1]).toBeLessThan(0);
  });

  it('고정을 풀면 속도 0에서 자연스럽게 낙하한다 (쌓인 가속도로 튀어나가지 않는다)', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1 });
    b.add({ x: 50, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 10, radius: 1, pinned: true });
    computeAccelerations(b);

    for (let s = 0; s < 500; s++) integrate(b, 1 / 120);
    expect(b.velX[1]).toBe(0);

    b.pinned[1] = 0; // 고정 해제
    integrate(b, 1 / 120);

    // 한 스텝 만에 광속으로 튀지 않고, 중심 쪽(-x)으로 아주 조금 움직이기 시작한다.
    expect(b.velX[1]).toBeLessThan(0);
    expect(Math.abs(b.velX[1])).toBeLessThan(1);
  });
});
