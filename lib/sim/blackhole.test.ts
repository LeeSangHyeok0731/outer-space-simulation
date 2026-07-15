import { describe, expect, it } from 'vitest';
import { applyCollapse, applyHawking, collapseAt, isBlackHoleAt } from './blackhole';
import { BodyBuffer, type BodyInit } from './bodies';
import { EventBuffer, EventKind } from './events';
import {
  COLLAPSE_MASS,
  EVAPORATION_FLOOR,
  HAWKING_K,
  schwarzschildRadius,
} from './units';

const make = (over: Partial<BodyInit> = {}): BodyInit => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1, ...over,
});

/** 호킹 증발 시간의 해석해: dM/dt = -K/M² 를 적분하면 t = M³ / (3K) */
const evaporationTime = (m: number) => (m * m * m) / (3 * HAWKING_K);

describe('applyCollapse (자동 붕괴)', () => {
  it('임계 질량을 넘으면 스스로 블랙홀이 된다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS + 1, radius: 9 }));

    expect(applyCollapse(b)).toBe(true);
    expect(isBlackHoleAt(b, 0)).toBe(true);
  });

  it('임계 질량 미만이면 붕괴하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS - 1, radius: 9 }));

    expect(applyCollapse(b)).toBe(false);
    expect(isBlackHoleAt(b, 0)).toBe(false);
  });

  it('붕괴하면 반지름이 사건의 지평선으로 바뀐다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6 }));

    applyCollapse(b);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(5000), 10);
  });

  it('붕괴하면 검게 변한다 (빛을 내지 않는다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6, color: [1, 0.7, 0.3] }));

    applyCollapse(b);
    expect(b.colR[0]).toBe(0);
    expect(b.colG[0]).toBe(0);
    expect(b.colB[0]).toBe(0);
  });

  it('이미 블랙홀인 천체는 다시 붕괴시키지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 5000, radius: 10.6 }));
    applyCollapse(b);

    expect(applyCollapse(b)).toBe(false); // 두 번째 호출은 아무 일도 안 한다
  });
});

describe('collapseAt (강제 붕괴 — 신의 손 치트)', () => {
  it('질량과 무관하게 블랙홀로 만든다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.5, radius: 0.3 })); // 소행성

    collapseAt(b, 0);
    expect(isBlackHoleAt(b, 0)).toBe(true);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(0.5), 10);
  });
});

describe('applyHawking (호킹 증발)', () => {
  it('블랙홀은 질량을 잃는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1);
    expect(b.mass[0]).toBeLessThan(100);
    expect(b.mass[0]).toBeCloseTo(100 - HAWKING_K / (100 * 100), 10);
  });

  it('질량이 줄어드는 것만으로는 true를 반환하지 않는다 (가속도 재계산 비용 회피)', () => {
    // 매 서브스텝 질량 변화로 accDirty를 세우면 블랙홀이 하나만 있어도 물리 비용이
    // 2배가 된다. 한 스텝의 질량 변화는 무시할 만하고(M=3000에서 상대 변화 ~1e-13),
    // integrate()가 어차피 매 스텝 내부에서 가속도를 다시 계산한다.
    const b = new BodyBuffer(4);
    b.add(make({ mass: 3000, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1 / 120)).toBe(false);
    expect(b.count).toBe(1);
  });

  it('천체가 사라질 때만 true를 반환한다 (다른 천체가 느끼는 힘이 실제로 바뀐다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.02, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1)).toBe(true);
    expect(b.count).toBe(0);
  });

  it('질량이 줄면 반지름도 함께 줄어든다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1);
    expect(b.radius[0]).toBeCloseTo(schwarzschildRadius(b.mass[0]), 10);
  });

  it('일반 천체는 증발하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));

    expect(applyHawking(b, 1)).toBe(false);
    expect(b.mass[0]).toBe(100);
  });

  it('작은 블랙홀은 소멸한다 — 치트를 물리가 정리한다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 1, radius: 1 }));
    collapseAt(b, 0);

    // 질량 1의 증발 시간은 약 1.67초. 넉넉히 3초를 굴린다.
    const dt = 1 / 120;
    for (let s = 0; s < 3 / dt && b.count > 0; s++) applyHawking(b, dt);

    expect(b.count).toBe(0);
  });

  it('큰 블랙홀은 사실상 증발하지 않는다', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: COLLAPSE_MASS, radius: 1 }));
    collapseAt(b, 0);

    // 증발 시간이 우주적으로 길다는 것을 해석해로 먼저 확인한다.
    expect(evaporationTime(COLLAPSE_MASS)).toBeGreaterThan(1e9);

    const dt = 1 / 120;
    for (let s = 0; s < 60 / dt; s++) applyHawking(b, dt); // 60 시뮬레이션-초

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeGreaterThan(COLLAPSE_MASS * 0.999);
  });

  it('질량이 바닥 아래로 내려가도 음수가 되지 않는다 (제거된다)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: EVAPORATION_FLOOR * 2, radius: 1 }));
    collapseAt(b, 0);

    // 아주 작은 질량에서는 dM/dt가 폭발적으로 커서 한 스텝에 음수로 넘어갈 수 있다.
    applyHawking(b, 1);
    expect(b.count).toBe(0);
  });

  it('여러 블랙홀 중 하나만 소멸해도 나머지는 멀쩡하다 (swap-remove 안전성)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ mass: 0.05, radius: 1 })); // 곧 사라질 것
    b.add(make({ mass: COLLAPSE_MASS, radius: 1 })); // 멀쩡할 것
    collapseAt(b, 0);
    collapseAt(b, 1);

    applyHawking(b, 1);

    expect(b.count).toBe(1);
    expect(b.mass[0]).toBeGreaterThan(COLLAPSE_MASS * 0.999);
    expect(isBlackHoleAt(b, 0)).toBe(true);
  });

  it('블랙홀이 소멸할 때 EVAPORATION 이벤트를 위치·질량과 함께 낸다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add(make({ x: 7, y: -3, z: 2, mass: 0.02, radius: 1 }));
    collapseAt(b, 0);

    expect(applyHawking(b, 1, events)).toBe(true);
    expect(b.count).toBe(0);
    expect(events.count).toBe(1);
    expect(events.kind[0]).toBe(EventKind.EVAPORATION);
    expect(events.x[0]).toBe(7);
    expect(events.y[0]).toBe(-3);
    expect(events.z[0]).toBe(2);
    expect(events.payload[0]).toBeCloseTo(0.02, 10); // 소멸 직전 질량
  });

  it('여러 블랙홀 중 소멸하는 쪽이 마지막이 아니어도 이벤트 위치는 제거 전 좌표다 (swap-remove 안전성)', () => {
    // index 0 = 곧 사라질 것(소멸), index 1 = 살아남아 index 0으로 swap-remove될 것.
    // applyHawking은 뒤에서부터 돌기 때문에 index 1(생존)을 먼저 지나치고 index 0(소멸)에서
    // removeAt(0)을 호출한다 — 이때 last(=1)의 데이터가 0으로 복사되는 실제 swap이 일어난다.
    // 이벤트 위치를 removeAt 이후에 읽으면 생존 천체의 좌표(0,0,0)가 찍힌다.
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add(make({ x: 7, y: -3, z: 2, mass: 0.02, radius: 1 })); // 소멸할 천체
    b.add(make({ x: 0, y: 0, z: 0, mass: COLLAPSE_MASS, radius: 1 })); // 생존할 천체
    collapseAt(b, 0);
    collapseAt(b, 1);

    expect(applyHawking(b, 1, events)).toBe(true);

    expect(b.count).toBe(1);
    expect(events.count).toBe(1);
    expect(events.kind[0]).toBe(EventKind.EVAPORATION);
    expect(events.x[0]).toBe(7);
    expect(events.y[0]).toBe(-3);
    expect(events.z[0]).toBe(2);
    expect(events.payload[0]).toBeCloseTo(0.02, 10);
  });

  it('질량이 줄기만 할 때는 이벤트를 내지 않는다', () => {
    const events = new EventBuffer(8);
    const b = new BodyBuffer(4);
    b.add(make({ mass: 100, radius: 1 }));
    collapseAt(b, 0);

    applyHawking(b, 1, events);

    expect(b.count).toBe(1);
    expect(events.count).toBe(0);
  });
});
