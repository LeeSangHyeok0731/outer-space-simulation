import type { SimulationEngine } from './engine';
import { BODY_PRESETS, G } from './units';

/** 중심 질량 M 주위 반지름 r에서 XZ 평면 원궤도를 도는 속도 */
function circularVelocity(M: number, r: number): [number, number, number] {
  const v = Math.sqrt((G * M) / r);
  return [0, 0, v];
}

/** 안정된 태양계: 항성 1 + 행성 3 + 소행성 띠 60. '망가뜨릴' 기본 캔버스. */
function buildSolar(engine: SimulationEngine): void {
  engine.reset();

  const starMass = BODY_PRESETS.star.mass;
  engine.spawn({
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: starMass,
    color: BODY_PRESETS.star.color,
  });

  const planetRadii = [60, 100, 155];
  for (const r of planetRadii) {
    engine.spawn({
      position: [r, 0, 0],
      velocity: circularVelocity(starMass, r),
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }

  // 소행성 띠: 반지름 200~230에 60개를 고르게 뿌린다
  const count = 60;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 200 + (i % 7) * 5;
    const v = Math.sqrt((G * starMass) / r);
    engine.spawn({
      position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
      velocity: [-Math.sin(angle) * v, 0, Math.cos(angle) * v],
      mass: BODY_PRESETS.asteroid.mass,
      color: BODY_PRESETS.asteroid.color,
    });
  }
}

/** 쌍성계: 비슷한 두 항성이 공통 무게중심을 공전 + 바깥 궤도 행성 둘. */
function buildBinary(engine: SimulationEngine): void {
  engine.reset();

  const m = 1500; // 붕괴 임계(3000) 아래 → 항성 유지
  const d = 80;
  // 두 등질량 별이 반지름 d/2로 무게중심을 원운동: v = √(G·m / 2d)
  const v = Math.sqrt((G * m) / (2 * d));
  engine.spawn({ position: [-d / 2, 0, 0], velocity: [0, 0, v], mass: m, color: BODY_PRESETS.star.color });
  engine.spawn({ position: [d / 2, 0, 0], velocity: [0, 0, -v], mass: m, color: BODY_PRESETS.star.color });

  // 바깥 행성은 총질량 2m을 도는 것으로 근사
  const total = 2 * m;
  for (const r of [220, 300]) {
    engine.spawn({
      position: [r, 0, 0],
      velocity: circularVelocity(total, r),
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }
}

/** 블랙홀 + 강착원반: 중앙 블랙홀 주위 공전 링 4개(안쪽 링은 ISCO 안이라 빨려든다). */
function buildBlackHole(engine: SimulationEngine, rng: () => number): void {
  engine.reset();

  const bhMass = 5000; // r_s=16, ISCO=48
  const id = engine.spawn({ position: [0, 0, 0], velocity: [0, 0, 0], mass: bhMass, color: [0, 0, 0] });
  engine.collapseToBlackHole(id);

  const rings = [45, 70, 100, 140]; // 45는 ISCO(48) 안쪽 → 즉시 흡수, 70은 조석 파괴대
  const perRing = 8;
  for (const r of rings) {
    const v = Math.sqrt((G * bhMass) / r);
    for (let i = 0; i < perRing; i++) {
      const angle = (i / perRing) * Math.PI * 2 + rng() * 0.2; // 살짝 흐트러 대칭 깨기
      engine.spawn({
        position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
        velocity: [-Math.sin(angle) * v, 0, Math.cos(angle) * v],
        mass: BODY_PRESETS.asteroid.mass,
        color: BODY_PRESETS.asteroid.color,
      });
    }
  }
}

/** 충돌 코스: 두 계가 서로를 향해 접근 → 충돌·병합(질량 충분하면 블랙홀 붕괴). */
function buildCollision(engine: SimulationEngine): void {
  engine.reset();

  const m = 1500;
  const approach = 4;
  const orbit = Math.sqrt((G * m) / 40); // 각 항성 주위 r=40 행성 공전 속도

  const systems: { sx: number; drift: number }[] = [
    { sx: -160, drift: approach },
    { sx: 160, drift: -approach },
  ];
  for (const { sx, drift } of systems) {
    engine.spawn({ position: [sx, 0, 0], velocity: [drift, 0, 0], mass: m, color: BODY_PRESETS.star.color });
    engine.spawn({
      position: [sx, 0, 40],
      velocity: [drift + orbit, 0, 0],
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
    engine.spawn({
      position: [sx, 0, -40],
      velocity: [drift - orbit, 0, 0],
      mass: BODY_PRESETS.planet.mass,
      color: BODY_PRESETS.planet.color,
    });
  }
}

export interface ScenePreset {
  key: string;
  label: string;
  description: string;
  build(engine: SimulationEngine, rng: () => number): void;
}

/** 프리셋 목록. 버튼 순서와 같다. 3단계 시나리오 프리셋. */
export const SCENE_PRESETS: readonly ScenePreset[] = [
  { key: 'solar', label: '안정된 태양계', description: '항성 + 행성 + 소행성 띠', build: buildSolar },
  { key: 'binary', label: '쌍성계', description: '두 항성이 서로를 공전', build: buildBinary },
  { key: 'blackhole', label: '블랙홀', description: '강착원반과 조석 파괴', build: buildBlackHole },
  { key: 'collision', label: '충돌 코스', description: '두 계가 정면충돌', build: buildCollision },
];

/** key에 해당하는 프리셋을 적용한다. 없는 key면 아무것도 하지 않는다. */
export function applyPreset(engine: SimulationEngine, key: string, rng: () => number): void {
  const preset = SCENE_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  preset.build(engine, rng);
}

/**
 * 첫 화면이 텅 빈 우주면 곤란하다. '안정된 태양계' 프리셋을 초기·리셋 씬으로 쓴다.
 * 정의는 buildSolar 한 곳에만 있다(DRY). 3단계 프리셋 레지스트리는 SCENE_PRESETS 참고.
 */
export function createStarterSystem(engine: SimulationEngine): void {
  buildSolar(engine);
}
