import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine, FIXED_DT, MAX_SUBSTEPS } from './engine';
import {
  BODY_PRESETS,
  BodyType,
  COLLAPSE_MASS,
  G,
  iscoRadius,
  MAX_BODIES,
  radiusFromMass,
  schwarzschildRadius,
} from './units';

const spawn = (e: SimulationEngine, x: number, mass = 10) =>
  e.spawn({ position: [x, 0, 0], velocity: [0, 0, 0], mass });

describe('SimulationEngine', () => {
  it('일시정지 상태에서는 시간이 흐르지 않는다', () => {
    const e = new SimulationEngine();
    spawn(e, 0);
    e.paused = true;
    e.step(1);
    expect(e.simTime).toBe(0);
  });

  it('배속을 올리면 같은 실시간에 더 많은 시뮬레이션 시간이 흐른다', () => {
    const a = new SimulationEngine();
    const b = new SimulationEngine();
    a.step(0.1);
    b.timeScale = 4;
    b.step(0.1);
    expect(b.simTime).toBeGreaterThan(a.simTime * 3.5);
  });

  it('프레임 dt가 튀어도 서브스텝 상한을 넘지 않는다 (죽음의 나선 방지)', () => {
    const e = new SimulationEngine();
    e.step(10); // 탭 복귀 등으로 dt가 10초 튄 상황
    expect(e.simTime).toBeLessThanOrEqual(MAX_SUBSTEPS * FIXED_DT + 1e-9);
  });

  it('용량이 가득 차면 spawn이 -1을 반환한다', () => {
    const e = new SimulationEngine();
    for (let i = 0; i < MAX_BODIES; i++) spawn(e, i * 100);
    expect(spawn(e, 999)).toBe(-1);
    expect(e.bodies.count).toBe(MAX_BODIES);
  });

  it('setMass는 반지름도 함께 갱신한다', () => {
    const e = new SimulationEngine();
    const id = spawn(e, 0, 10);
    e.setMass(id, 8000);
    const i = e.bodies.indexOfId(id);
    expect(e.bodies.mass[i]).toBe(8000);
    expect(e.bodies.radius[i]).toBeCloseTo(radiusFromMass(8000), 10);
  });

  it('applyImpulse는 속도를 바꾼다', () => {
    const e = new SimulationEngine();
    const id = spawn(e, 0);
    e.applyImpulse(id, 3, 0, 0);
    expect(e.bodies.velX[e.bodies.indexOfId(id)]).toBeCloseTo(3, 10);
  });

  it('같은 입력에 같은 결과를 낸다 (결정론)', () => {
    const build = () => {
      const e = new SimulationEngine();
      e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 1000 });
      e.spawn({ position: [80, 0, 0], velocity: [0, 0, 3.5], mass: 5 });
      e.spawn({ position: [-60, 0, 20], velocity: [0.5, 0, -3], mass: 5 });
      return e;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 300; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.bodies.count).toBe(b.bodies.count);
    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posX[i]).toBe(b.bodies.posX[i]);
      expect(a.bodies.posZ[i]).toBe(b.bodies.posZ[i]);
    }
  });

  it('오염된 천체(NaN)를 제거하고 다른 천체로 전염시키지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = new SimulationEngine();
    const healthy = e.spawn({ position: [500, 0, 0], velocity: [0, 0, 0], mass: 1 });
    const sick = spawn(e, 0);

    e.bodies.velX[e.bodies.indexOfId(sick)] = Number.NaN;
    e.step(1 / 60);

    expect(e.bodies.indexOfId(sick)).toBe(-1);
    const h = e.bodies.indexOfId(healthy);
    expect(h).not.toBe(-1);
    expect(Number.isFinite(e.bodies.posX[h])).toBe(true);
    warn.mockRestore();
  });

  it('serialize → load 왕복이 천체 수·위치·질량·simTime을 보존한다', () => {
    const e = new SimulationEngine();
    e.spawn({ position: [1, 2, 3], velocity: [4, 5, 6], mass: 7, color: [0.1, 0.2, 0.3] });
    e.step(1 / 60);
    const snapshot = e.serialize();

    const e2 = new SimulationEngine();
    e2.load(snapshot);

    expect(e2.bodies.count).toBe(e.bodies.count);
    expect(e2.simTime).toBe(e.simTime);
    expect(e2.bodies.posX[0]).toBe(e.bodies.posX[0]);
    expect(e2.bodies.mass[0]).toBe(e.bodies.mass[0]);
  });

  it('reset은 모든 천체와 시간을 지운다', () => {
    const e = new SimulationEngine();
    spawn(e, 0);
    e.step(1 / 60);
    e.reset();
    expect(e.bodies.count).toBe(0);
    expect(e.simTime).toBe(0);
  });
});

describe('SimulationEngine 위치 고정', () => {
  it('setPinned로 고정하면 움직이지 않고, 풀면 다시 움직인다', () => {
    const e = new SimulationEngine();
    e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 5000 });
    const id = e.spawn({ position: [100, 0, 0], velocity: [0, 0, 0], mass: 1 });

    e.setPinned(id, true);
    expect(e.isPinned(id)).toBe(true);
    for (let i = 0; i < 60; i++) e.step(1 / 60);
    expect(e.bodies.posX[e.bodies.indexOfId(id)]).toBe(100);

    e.setPinned(id, false);
    expect(e.isPinned(id)).toBe(false);
    for (let i = 0; i < 60; i++) e.step(1 / 60);
    expect(e.bodies.posX[e.bodies.indexOfId(id)]).toBeLessThan(100);
  });

  it('고정하면 그 순간의 속도가 0이 된다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [7, 0, 3], mass: 1 });
    e.setPinned(id, true);
    const i = e.bodies.indexOfId(id);
    expect(e.bodies.velX[i]).toBe(0);
    expect(e.bodies.velZ[i]).toBe(0);
  });

  it('없는 id에 setPinned를 불러도 아무 일도 일어나지 않는다', () => {
    const e = new SimulationEngine();
    e.setPinned(999, true);
    expect(e.isPinned(999)).toBe(false);
  });

  it('serialize → load 왕복이 고정 상태를 보존한다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [1, 2, 3], velocity: [0, 0, 0], mass: 7 });
    e.setPinned(id, true);

    const e2 = new SimulationEngine();
    e2.load(e.serialize());

    expect(e2.bodies.pinned[0]).toBe(1);
  });
});

describe('SimulationEngine 블랙홀', () => {
  it('항성 두 개가 병합하면 그 자리에서 블랙홀이 된다', () => {
    // COLLAPSE_MASS(3000)는 항성 프리셋(2000)보다 크고 둘의 합(4000)보다 작다.
    const e = new SimulationEngine();
    const a = e.spawn({
      position: [0, 0, 0], velocity: [0, 0, 0],
      mass: BODY_PRESETS.star.mass, color: BODY_PRESETS.star.color,
    });
    e.spawn({
      position: [1, 0, 0], velocity: [0, 0, 0],
      mass: BODY_PRESETS.star.mass, color: BODY_PRESETS.star.color,
    });

    e.step(1 / 60);

    expect(e.bodies.count).toBe(1);
    expect(e.isBlackHole(e.bodies.id[0])).toBe(true);
    expect(e.bodies.mass[0]).toBeCloseTo(BODY_PRESETS.star.mass * 2, 6);
    expect(a).not.toBe(-1);
  });

  it('임계 미만의 천체는 그대로 남는다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: COLLAPSE_MASS - 100 });

    e.step(1 / 60);

    expect(e.isBlackHole(id)).toBe(false);
  });

  it('collapseToBlackHole은 질량과 무관하게 블랙홀로 만든다 (치트)', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 500 });

    e.collapseToBlackHole(id);

    expect(e.isBlackHole(id)).toBe(true);
    expect(e.bodies.radius[e.bodies.indexOfId(id)]).toBeCloseTo(schwarzschildRadius(500), 10);
  });

  it('없는 id로 collapseToBlackHole을 불러도 아무 일도 없다', () => {
    const e = new SimulationEngine();
    e.collapseToBlackHole(999);
    expect(e.isBlackHole(999)).toBe(false);
  });

  it('치트로 만든 작은 블랙홀은 스스로 증발해 사라진다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 1 });
    e.collapseToBlackHole(id);

    // 질량 1의 증발 시간은 약 1.67초. 5초를 굴린다.
    for (let i = 0; i < 5 * 60; i++) e.step(1 / 60);

    expect(e.bodies.indexOfId(id)).toBe(-1);
    expect(e.bodies.count).toBe(0);
  });

  it('블랙홀은 ISCO 안의 천체를 궤도 속도와 무관하게 삼킨다', () => {
    const e = new SimulationEngine();
    const bhMass = 5000;
    const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass });
    e.collapseToBlackHole(bh);

    const r = iscoRadius(bhMass) * 0.9;
    const v = Math.sqrt((G * bhMass) / r);
    e.spawn({ position: [r, 0, 0], velocity: [0, 0, v], mass: 1 });

    expect(e.bodies.count).toBe(2);
    e.step(1 / 60);
    expect(e.bodies.count).toBe(1);
  });

  it('ISCO 밖의 천체는 블랙홀 주위를 정상적으로 공전한다 (중력은 그대로다)', () => {
    const e = new SimulationEngine();
    const bhMass = 5000;
    const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass });
    e.collapseToBlackHole(bh);

    const r = 200; // ISCO(=96)보다 한참 밖
    const v = Math.sqrt((G * bhMass) / r);
    const sat = e.spawn({ position: [r, 0, 0], velocity: [0, 0, v], mass: 1e-3 });

    for (let i = 0; i < 10 * 60; i++) e.step(1 / 60);

    const i = e.bodies.indexOfId(sat);
    expect(i).not.toBe(-1); // 살아 있다
    const dist = Math.hypot(e.bodies.posX[i], e.bodies.posY[i], e.bodies.posZ[i]);
    expect(Math.abs(dist - r) / r).toBeLessThan(0.05); // 궤도를 유지한다
  });

  it('블랙홀 상태가 serialize → load 왕복에서 보존된다', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 5000 });
    e.collapseToBlackHole(id);

    const e2 = new SimulationEngine();
    e2.load(e.serialize());

    expect(e2.bodies.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(e2.bodies.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('블랙홀이 있어도 결정론이 유지된다', () => {
    const build = () => {
      const e = new SimulationEngine();
      const bh = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 4000 });
      e.collapseToBlackHole(bh);
      e.spawn({ position: [150, 0, 0], velocity: [0, 0, 5], mass: 10 });
      e.spawn({ position: [-120, 0, 40], velocity: [1, 0, -5], mass: 10 });
      return e;
    };
    const a = build();
    const b = build();

    for (let i = 0; i < 300; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }

    expect(a.bodies.count).toBe(b.bodies.count);
    for (let i = 0; i < a.bodies.count; i++) {
      expect(a.bodies.posX[i]).toBe(b.bodies.posX[i]);
      expect(a.bodies.mass[i]).toBe(b.bodies.mass[i]);
    }
  });

  it('setMass는 블랙홀의 반지름을 사건의 지평선으로 유지한다 (일시정지 중에도, step 없이 즉시)', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 5000 });
    e.collapseToBlackHole(id);
    e.paused = true;

    e.setMass(id, 9000);

    const i = e.bodies.indexOfId(id);
    expect(e.bodies.mass[i]).toBe(9000);
    expect(e.bodies.radius[i]).toBeCloseTo(schwarzschildRadius(9000), 10);
  });

  it('setMass는 일반 천체에는 기존대로 밀도 기반 반지름을 적용한다 (회귀 없음)', () => {
    const e = new SimulationEngine();
    const id = e.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: 20 });

    e.setMass(id, 80);

    const i = e.bodies.indexOfId(id);
    expect(e.bodies.mass[i]).toBe(80);
    expect(e.bodies.radius[i]).toBeCloseTo(radiusFromMass(80), 10);
  });
});
