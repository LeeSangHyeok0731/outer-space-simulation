import { describe, it, expect } from 'vitest';
import { collapseAt } from './blackhole';
import { BodyBuffer } from './bodies';
import { resolveCollisions } from './collisions';
import { EventBuffer, EventKind } from './events';
import { BodyType, G, iscoRadius, schwarzschildRadius } from './units';

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

describe('고정된 천체의 병합', () => {
  it('고정이 이긴다: 합쳐진 천체는 닻 위치에 그대로 멈춰 있고 계속 고정 상태다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 5, pinned: true });
    b.add({ x: 103, y: 0, z: 0, vx: -20, vy: 0, vz: 0, mass: 10, radius: 2 });

    expect(resolveCollisions(b)).toBe(true);
    expect(b.count).toBe(1);
    expect(b.posX[0]).toBe(100); // 질량중심(100.03…)이 아니라 닻 위치 그대로
    expect(b.velX[0]).toBe(0); // 운동량 보존을 적용하지 않는다 — 닻은 밀리지 않는다
    expect(b.pinned[0]).toBe(1);
    expect(b.mass[0]).toBeCloseTo(1010, 10); // 질량만 불어난다
  });

  it('가벼운 쪽이 고정돼 있어도 위치는 그 닻을 따른다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 3, pinned: true });
    b.add({ x: 2, y: 0, z: 0, vx: 5, vy: 0, vz: 0, mass: 500, radius: 3 });

    resolveCollisions(b);
    expect(b.count).toBe(1);
    expect(b.posX[0]).toBe(0);
    expect(b.velX[0]).toBe(0);
    expect(b.pinned[0]).toBe(1);
  });

  it('둘 다 고정이 아니면 기존대로 운동량이 보존된다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 4, vy: 0, vz: 0, mass: 3, radius: 2 });
    b.add({ x: 1, y: 0, z: 0, vx: -2, vy: 0, vz: 0, mass: 1, radius: 2 });

    resolveCollisions(b);
    expect(b.pinned[0]).toBe(0);
    expect(b.velX[0]).toBeCloseTo(2.5, 10);
  });
});

describe('블랙홀의 흡수', () => {
  it('ISCO 안에 들어오면 원궤도 속도로 돌고 있어도 삼켜진다', () => {
    // 이것이 이 설계의 핵심이다. 뉴턴 중력에서는 아무리 가까워도 빠르기만 하면
    // 궤도를 돌 수 있다. 실제 블랙홀 근처에는 안정 궤도가 없다.
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const isco = iscoRadius(bhMass);
    const r = isco * 0.9; // ISCO 안쪽
    const vCircular = Math.sqrt((G * bhMass) / r); // 완벽한 원궤도 속도

    b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: vCircular, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(true);
    expect(b.count).toBe(1); // 궤도 속도를 갖고 있어도 소용없다
  });

  it('ISCO 밖에서는 삼켜지지 않는다 (중력은 그대로다)', () => {
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const r = iscoRadius(bhMass) * 1.1; // ISCO 바깥
    b.add({ x: r, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(false);
    expect(b.count).toBe(2);
  });

  it('블랙홀의 흡수 반경은 사건의 지평선보다 훨씬 크다', () => {
    // 검은 구(r_s)에 닿기 한참 전에 이미 삼켜진다.
    const b = new BodyBuffer(4);
    const bhMass = 5000;
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: bhMass, radius: 1 });
    collapseAt(b, 0);

    const rs = schwarzschildRadius(bhMass);
    b.add({ x: rs * 2.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3 });

    expect(resolveCollisions(b)).toBe(true); // r_s의 2.5배 거리인데도 삼켜진다 (ISCO = 3 r_s)
  });

  it('블랙홀이 이긴다: 가벼운 블랙홀이 무거운 항성을 먹어도 결과는 블랙홀', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    const bhId = b.id[0];

    // 훨씬 무거운 항성을 ISCO 안에 놓는다
    b.add({ x: iscoRadius(1000) * 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 9000, radius: 12 });

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(b.id[0]).toBe(bhId); // 정체성도 블랙홀 쪽을 물려받는다
    expect(b.mass[0]).toBeCloseTo(10000, 6);
    expect(b.colR[0]).toBe(0); // 여전히 검다
  });

  it('블랙홀이 높은 인덱스에 있어도 이긴다 (j쪽 정체성 승계)', () => {
    // 앞 테스트는 블랙홀이 i=0이라 정체성이 그대로 유지되는 경로만 탄다.
    // 여기서는 일반 천체가 i=0, 블랙홀이 j=1이라 j쪽 정체성을 물려받는 경로를 탄다.
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 9000, radius: 12 }); // 무거운 항성, i=0
    b.add({ x: iscoRadius(1000) * 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 1 }); // 가벼운 블랙홀 후보, j=1
    collapseAt(b, 1);
    const bhId = b.id[1];

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(b.id[0]).toBe(bhId); // 무거운 항성이 아니라 블랙홀 쪽 정체성을 물려받는다
    expect(b.mass[0]).toBeCloseTo(10000, 6);
    expect(b.colR[0]).toBe(0);
  });

  it('질량이 다른 두 블랙홀은 더 큰 ISCO로 삼킨다', () => {
    // captureDistance의 Math.max를 실제로 변별한다: 작은 블랙홀의 ISCO 밖이지만
    // 큰 블랙홀의 ISCO 안인 거리에 두 블랙홀을 놓으면 삼켜져야 한다.
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100, radius: 1 }); // 작은 블랙홀
    collapseAt(b, 0);
    const big = 8000;
    const d = (iscoRadius(100) + iscoRadius(big)) / 2; // 작은 ISCO 밖, 큰 ISCO 안
    b.add({ x: d, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: big, radius: 1 }); // 큰 블랙홀
    collapseAt(b, 1);

    expect(d).toBeGreaterThan(iscoRadius(100)); // 작은 블랙홀만이라면 삼키지 못할 거리
    expect(resolveCollisions(b)).toBe(true);
    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeCloseTo(big + 100, 6);
  });

  it('블랙홀의 반지름은 부피 합성이 아니라 사건의 지평선이다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    b.add({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1000, radius: 8 });

    resolveCollisions(b);

    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('블랙홀끼리 병합하면 질량이 합쳐진 블랙홀이 된다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
    expect(b.mass[0]).toBeCloseTo(8000, 6);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(8000), 10);
  });

  it('일반 천체끼리는 기존 규칙 그대로다 (부피 보존)', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 3 });
    b.add({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 4 });

    resolveCollisions(b);

    expect(b.type[0]).toBe(BodyType.NORMAL);
    expect(b.radius[0]).toBeCloseTo(Math.cbrt(27 + 64), 10);
  });

  it('고정된 블랙홀은 먹어도 밀리지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5000, radius: 1, pinned: true });
    collapseAt(b, 0);
    b.add({ x: 110, y: 0, z: 0, vx: -50, vy: 0, vz: 0, mass: 100, radius: 1 });

    resolveCollisions(b);

    expect(b.count).toBe(1);
    expect(b.posX[0]).toBe(100);
    expect(b.velX[0]).toBe(0);
    expect(b.pinned[0]).toBe(1);
    expect(b.type[0]).toBe(BodyType.BLACK_HOLE);
  });
});

describe('블랙홀 병합 킥과 MERGE 이벤트', () => {
  it('블랙홀 쌍성 병합은 운동량 보존 속도 위에 킥을 더한다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    // 질량이 다른 두 블랙홀이 서로 스치며 x축으로 상대운동한다.
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    // 순수 운동량 보존 속도 (킥이 없다면 이것)
    const momentumVx = (4000 * 0 + 1000 * 6) / 5000; // = 1.2

    resolveCollisions(b, events);

    expect(b.count).toBe(1);
    // 상대속도가 +x이므로 킥도 +x. 실제 속도는 운동량 속도보다 커야 한다.
    expect(b.velX[0]).toBeGreaterThan(momentumVx);
  });

  it('같은 질량 블랙홀 병합은 킥이 없다 (운동량 속도 그대로)', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    const momentumVx = (4000 * 0 + 4000 * 6) / 8000; // = 3

    resolveCollisions(b, events);

    expect(b.velX[0]).toBeCloseTo(momentumVx, 10); // 킥 0
  });

  it('킥 방향은 병합 직전 상대속도 방향이다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    // 상대속도를 +z로 준다. 킥도 +z여야 한다(x·y는 운동량대로).
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 10, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    const momentumVz = (1000 * 10) / 5000; // = 2

    resolveCollisions(b, events);

    expect(b.velZ[0]).toBeGreaterThan(momentumVz); // +z 킥
    expect(b.velX[0]).toBeCloseTo(0, 10); // 다른 축은 킥 없음
    expect(b.velY[0]).toBeCloseTo(0, 10);
  });

  it('고정된 블랙홀은 킥에도 안 밀린다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1, pinned: true });
    b.add({ x: 3, y: 0, z: 0, vx: 6, vy: 0, vz: 0, mass: 1000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b, events);

    expect(b.count).toBe(1);
    expect(b.velX[0]).toBe(0); // pinned가 킥을 이긴다
    expect(b.velY[0]).toBe(0);
    expect(b.velZ[0]).toBe(0);
  });

  it('블랙홀 쌍성 병합은 MERGE 이벤트를 잔여 질량·위치로 방출한다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    b.add({ x: 3, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 4000, radius: 1 });
    collapseAt(b, 0);
    collapseAt(b, 1);

    resolveCollisions(b, events);

    expect(events.count).toBe(1);
    expect(events.kind[0]).toBe(EventKind.MERGE);
    expect(events.payload[0]).toBeCloseTo(8000, 6); // 잔여 질량
    expect(events.x[0]).toBeCloseTo(1.5, 6); // 질량중심(같은 질량이라 중간)
  });

  it('블랙홀이 일반 천체를 삼킬 때는 킥도 MERGE 이벤트도 없다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 5000, radius: 1 });
    collapseAt(b, 0);
    b.add({ x: iscoRadius(5000) * 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 8, mass: 1, radius: 0.3 });

    const momentumVz = (1 * 8) / 5001;

    resolveCollisions(b, events);

    expect(events.count).toBe(0); // MERGE 이벤트 없음
    expect(b.velZ[0]).toBeCloseTo(momentumVz, 10); // 킥 없음(운동량대로)
  });
});
