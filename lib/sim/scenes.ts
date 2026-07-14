import type { SimulationEngine } from './engine';
import { BODY_PRESETS, G } from './units';

/** 중심 질량 M 주위 반지름 r에서 XZ 평면 원궤도를 도는 속도 */
function circularVelocity(M: number, r: number): [number, number, number] {
  const v = Math.sqrt((G * M) / r);
  return [0, 0, v];
}

/**
 * 첫 화면이 텅 빈 우주면 곤란하다. 항성 하나 + 행성 셋 + 소행성 띠.
 * 3단계 시나리오 프리셋은 이 함수를 확장한 형태가 된다.
 */
export function createStarterSystem(engine: SimulationEngine): void {
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
