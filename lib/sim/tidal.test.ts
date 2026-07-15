import { describe, expect, it } from 'vitest';
import { BodyBuffer } from './bodies';
import { EventBuffer, EventKind } from './events';
import { resolveTidalDisruption } from './tidal';
import { BodyType, iscoRadius, radiusFromMass, tidalRadius, TIDAL_FRAGMENTS } from './units';

/** 블랙홀(원점) + 그 조석 띠 안의 일반 천체 하나를 담은 버퍼를 만든다. */
function makeScene(capacity = 64) {
  const b = new BodyBuffer(capacity);
  // 블랙홀: 질량 3000, 반지름은 사건의 지평선. (테스트에선 radius를 직접 준다.)
  b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 3000, radius: 9.6, type: BodyType.BLACK_HOLE });
  return b;
}

describe('resolveTidalDisruption', () => {
  it('조석 띠 안의 천체를 N개 파편(DEBRIS)으로 부순다', () => {
    const b = makeScene();
    const rBody = radiusFromMass(20);
    // ISCO(≈28.8) < 35 < r_t(≈44.7) 이므로 파괴된다.
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 3, vz: 0, mass: 20, radius: rBody, type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(true);

    let debris = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.DEBRIS) debris++;
    expect(debris).toBe(TIDAL_FRAGMENTS);
    // 블랙홀 1 + 파편 N (원래 천체는 제거됨)
    expect(b.count).toBe(1 + TIDAL_FRAGMENTS);
  });

  it('질량과 운동량을 보존한다', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 1, vy: 3, vz: -2, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });

    resolveTidalDisruption(b);

    let m = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.DEBRIS) continue;
      m += b.mass[i];
      px += b.mass[i] * b.velX[i];
      py += b.mass[i] * b.velY[i];
      pz += b.mass[i] * b.velZ[i];
    }
    expect(m).toBeCloseTo(20);
    expect(px).toBeCloseTo(20 * 1);
    expect(py).toBeCloseTo(20 * 3);
    expect(pz).toBeCloseTo(20 * -2);
  });

  it('DEBRIS는 다시 파괴되지 않는다 (폭주 방지)', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
    resolveTidalDisruption(b);
    const after = b.count;

    // 두 번째 호출: 파편은 DEBRIS라 그대로여야 한다.
    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
    expect(b.count).toBe(after);
  });

  it('예산이 부족하면 파괴하지 않는다', () => {
    // capacity 8: 블랙홀 1 + 더미 2 + 천체 1 = 4. 4 + (6-1) = 9 > 8 → 건너뜀.
    const b = new BodyBuffer(8);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 3000, radius: 9.6, type: BodyType.BLACK_HOLE });
    b.add({ x: 500, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3, type: BodyType.NORMAL });
    b.add({ x: 600, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 0.3, type: BodyType.NORMAL });
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
    expect(b.count).toBe(4);
    // 천체는 여전히 NORMAL(파괴 안 됨).
    let normals = 0;
    for (let i = 0; i < b.count; i++) if (b.type[i] === BodyType.NORMAL) normals++;
    expect(normals).toBe(3);
  });

  it('r_t ≤ ISCO면 파괴하지 않는다 (통째 흡수 경로)', () => {
    // 아주 큰 블랙홀: ISCO가 r_t보다 크다.
    const b = new BodyBuffer(64);
    b.add({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 100000, radius: 320, type: BodyType.BLACK_HOLE });
    const rBody = radiusFromMass(20);
    // r_t < ISCO 임을 전제로 한 시나리오.
    expect(tidalRadius(20, 100000)).toBeLessThan(iscoRadius(100000));
    b.add({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: rBody, type: BodyType.NORMAL });

    const changed = resolveTidalDisruption(b);
    expect(changed).toBe(false);
  });

  it('TIDAL 이벤트를 낸다', () => {
    const b = makeScene();
    b.add({ x: 35, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
    const ev = new EventBuffer();

    resolveTidalDisruption(b, ev);

    let tidal = 0;
    for (let k = 0; k < ev.count; k++) if (ev.kind[k] === EventKind.TIDAL) tidal++;
    expect(tidal).toBe(1);
  });

  it('결정론: 같은 입력이면 같은 파편 배치', () => {
    const run = () => {
      const b = makeScene();
      b.add({ x: 35, y: 0, z: 0, vx: 1, vy: 3, vz: 0, mass: 20, radius: radiusFromMass(20), type: BodyType.NORMAL });
      resolveTidalDisruption(b);
      const out: number[] = [];
      for (let i = 0; i < b.count; i++) out.push(b.posX[i], b.posY[i], b.posZ[i], b.velX[i], b.velY[i], b.velZ[i]);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
