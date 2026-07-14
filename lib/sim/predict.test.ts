import { describe, it, expect } from 'vitest';
import { BodyBuffer } from './bodies';
import { predictTrajectory } from './predict';
import { SimulationEngine, FIXED_DT } from './engine';
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

  it('예측 궤적이 실제 엔진 궤적과 근접하게 일치한다 (프리뷰가 플레이어를 속이지 않는지 확인)', () => {
    // predictTrajectory와 엔진은 서로 다른 적분기다:
    //   - predict: 세미-임플리시트 오일러, dt=1/60, 던지는 순간의 중력장을 고정
    //   - engine:  립프로그(속도 베릴렛), dt=1/120, 매 서브스텝마다 중력장을 재계산
    // 이 둘이 실제로 얼마나 벌어지는지 지금까지 아무도 재본 적이 없었다. 이 테스트는
    // 그 이격을 못박는(pin) 것이 목적이지, 두 적분기를 같게 만드는 게 목적이 아니다.
    const engine = new SimulationEngine();
    const M = 2000; // 항성급 중심 질량 하나만 두고 시작 — 새총 던지기에서 가장 흔한 상황
    engine.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: M, color: [1, 1, 1] });

    const r = 100;
    const v = Math.sqrt((G * M) / r); // 원궤도 속도로 던진다
    const start: [number, number, number] = [r, 0, 0];
    const vel: [number, number, number] = [0, 0, v];

    const PREDICT_DT = 1 / 60; // SpawnController.tsx가 실제로 넘기는 값과 동일
    const predictSteps = 400; // SpawnController.tsx의 PREVIEW_POINTS와 동일 — 드래그 중 실제로 그려지는 미리보기 전체 길이
    const PREVIEW_SECONDS = predictSteps * PREDICT_DT; // ≈ 6.67초, 반지름 100 궤도 주기(~63)의 약 10.6%
    const out = new Float32Array(predictSteps * 3);
    const n = predictTrajectory(engine.bodies, start, vel, out, PREDICT_DT);
    expect(n).toBe(predictSteps);

    // 같은 천체를 실제로 스폰하고, 같은 길이만큼 엔진을 굴린다.
    const thrownId = engine.spawn({ position: start, velocity: vel, mass: 0.5, color: [1, 1, 1] });
    const totalSubsteps = Math.round(PREVIEW_SECONDS / FIXED_DT);
    for (let i = 0; i < totalSubsteps; i++) {
      engine.step(FIXED_DT);
    }
    expect(engine.simTime).toBeCloseTo(PREVIEW_SECONDS, 5);

    const idx = engine.bodies.indexOfId(thrownId);
    expect(idx).not.toBe(-1); // 이 구간에서 병합/오염으로 사라지면 안 된다

    const actual: [number, number, number] = [
      engine.bodies.posX[idx],
      engine.bodies.posY[idx],
      engine.bodies.posZ[idx],
    ];
    const lastIdx = (predictSteps - 1) * 3;
    const predicted: [number, number, number] = [out[lastIdx], out[lastIdx + 1], out[lastIdx + 2]];

    const divergence = Math.hypot(
      actual[0] - predicted[0],
      actual[1] - predicted[1],
      actual[2] - predicted[2],
    );

    // 허용 오차는 실측으로 정했다: 400점(≈6.67초, 궤도 주기의 약 10.6%) 미리보기 끝에서
    // 실측 divergence는 약 0.0114 단위, 즉 반지름(100)의 0.0114%였다 — 두 적분기가 진짜로
    // 갈릴 여지가 있는데도 이렇게 작은 이유는, 여기서 쓰는 시나리오(무거운 중심 천체 하나 +
    // 가벼운 탐침 하나)에서는 "중력장을 고정한다"는 predict의 가정과 "매 스텝 재계산한다"는
    // 엔진의 실제 동작이 사실상 같은 결과를 내기 때문이다(중심 천체가 가벼운 탐침에게
    // 거의 영향받지 않아 움직이지 않는다). 즉 새총으로 흔히 겪는 "무거운 것 주위를 도는
    // 가벼운 것 던지기" 상황에서는 프리뷰가 실제 궤도를 정직하게 보여준다는 뜻이다.
    // 여유를 반지름의 1%(실측치의 약 90배)로 잡는다 — 이 정도 벌어지면 프리뷰가 실제
    // 궤도와 화면상 눈에 띄게 달라진다는 신호이므로, 값을 완화하는 대신 회귀로 보고해야 한다.
    expect(divergence).toBeLessThan(r * 0.01);
  });
});
