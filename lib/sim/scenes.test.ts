import { describe, it, expect } from 'vitest';
import { SimulationEngine, MAX_FRAME_DT } from './engine';
import { createStarterSystem, SCENE_PRESETS, applyPreset } from './scenes';
import { BodyType } from './units';

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
    // 64개 천체를 60 시뮬레이션-초만큼 굴린다. 한가한 머신에서는 ~330ms지만 부하가
    // 걸리면 기본 5초 제한을 넘겨 실패한 적이 있다. 느려서 나는 빨간불은 회귀 신호를 가린다.
  }, 30_000);
});

const RNG = () => 0.5; // 결정론적 난수

describe('SCENE_PRESETS', () => {
  it('solar/binary/blackhole/collision 4종을 이 순서로 노출한다', () => {
    expect(SCENE_PRESETS.map((p) => p.key)).toEqual([
      'solar',
      'binary',
      'blackhole',
      'collision',
    ]);
  });

  it('모든 프리셋은 유한한 천체만 만든다 (NaN/Infinity 없음)', () => {
    for (const preset of SCENE_PRESETS) {
      const engine = new SimulationEngine();
      preset.build(engine, RNG);
      const b = engine.bodies;
      expect(b.count).toBeGreaterThan(0);
      for (let i = 0; i < b.count; i++) {
        for (const arr of [b.posX, b.posY, b.posZ, b.velX, b.velY, b.velZ, b.mass, b.radius]) {
          expect(Number.isFinite(arr[i])).toBe(true);
        }
      }
    }
  });

  it('기대하는 천체 수를 만든다', () => {
    const counts: Record<string, number> = {
      solar: 64,
      binary: 4,
      blackhole: 33,
      collision: 6,
    };
    for (const preset of SCENE_PRESETS) {
      const engine = new SimulationEngine();
      preset.build(engine, RNG);
      expect(engine.bodies.count).toBe(counts[preset.key]);
    }
  });

  it('blackhole 프리셋은 블랙홀을 정확히 1개 만든다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'blackhole', RNG);
    const b = engine.bodies;
    let holes = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.BLACK_HOLE) holes++;
    expect(holes).toBe(1);
  });

  it('collision 프리셋은 시작 시 블랙홀이 없다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'collision', RNG);
    const b = engine.bodies;
    for (let i = 0; i < b.count; i++) expect(b.type[i]).not.toBe(BodyType.BLACK_HOLE);
  });

  it('applyPreset는 없는 key를 안전하게 무시한다', () => {
    const engine = new SimulationEngine();
    applyPreset(engine, 'nope', RNG);
    expect(engine.bodies.count).toBe(0);
  });

  it('createStarterSystem은 solar 프리셋과 같은 천체 수를 낸다', () => {
    const a = new SimulationEngine();
    createStarterSystem(a);
    const bEng = new SimulationEngine();
    applyPreset(bEng, 'solar', RNG);
    expect(a.bodies.count).toBe(bEng.bodies.count);
  });
});
