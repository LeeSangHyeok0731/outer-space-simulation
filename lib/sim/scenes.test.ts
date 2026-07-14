import { describe, it, expect } from 'vitest';
import { SimulationEngine, MAX_FRAME_DT } from './engine';
import { createStarterSystem } from './scenes';

describe('createStarterSystem', () => {
  it('항성 1 + 행성 3 + 소행성 60 = 64개 천체를 만든다', () => {
    const engine = new SimulationEngine();
    createStarterSystem(engine);

    expect(engine.bodies.count).toBe(64);
  });

  it('첫 서브스텝에서 아무것도 병합되지 않는다', () => {
    const engine = new SimulationEngine();
    createStarterSystem(engine);

    engine.step(MAX_FRAME_DT);

    expect(engine.bodies.count).toBe(64);
  });

  it('시뮬레이션 시간으로 60초가 지나도 시스템이 무너지지 않는다', () => {
    const engine = new SimulationEngine();
    createStarterSystem(engine);

    // timeScale=5, realDt=MAX_FRAME_DT(0.05)일 때 accumulator 증가분은
    // 0.05*5=0.25 → 정확히 30서브스텝(0.25초). MAX_SUBSTEPS(32) 이내라
    // 밀린 시간이 버려지지 않아 simTime이 정확히 0.25초씩 전진한다.
    engine.timeScale = 5;
    const SIM_SECONDS = 60;
    const STEP_SIM_SECONDS = 0.25;
    const calls = SIM_SECONDS / STEP_SIM_SECONDS;
    for (let i = 0; i < calls; i++) {
      engine.step(MAX_FRAME_DT);
    }

    expect(engine.simTime).toBeCloseTo(SIM_SECONDS, 5);
    // 천체 수가 그대로라는 것은 이번 60초 동안 병합(swap-remove)이 한 번도 일어나지
    // 않았다는 뜻이다 — 즉 스폰 당시의 인덱스 배치(0=항성, 1~3=행성, 4~63=소행성)가
    // 그대로 유지된다. 아래 반지름 밴드 검사가 그 가정에 기대고 있다.
    expect(engine.bodies.count).toBe(64);

    // 소행성은 scenes.ts에서 항성 주위 r=200~230(200 + (i%7)*5)에서 원궤도로 출발한다.
    // 60 시뮬레이션-시간 단위는 이 반지름대의 공전 주기(약 400~490)에 비해 짧아
    // (약 12~15%의 호), 행성들의 섭동을 받아도 궤도 자체가 무너지지는 않아야 한다.
    // [150, 300] 밴드는 그 변동을 여유 있게 감안한 값이다.
    const b = engine.bodies;
    for (let i = 4; i < b.count; i++) {
      const r = Math.hypot(b.posX[i], b.posY[i], b.posZ[i]);
      expect(r).toBeGreaterThan(150);
      expect(r).toBeLessThan(300);
    }
  });
});
