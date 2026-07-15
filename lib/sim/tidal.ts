import type { BodyBuffer } from './bodies';
import { EventKind, type EventBuffer } from './events';
import { BodyType, iscoRadius, radiusFromMass, tidalRadius, TIDAL_FRAGMENTS } from './units';

// 파편 배치·속도 스프레드 조정 상수(스펙 §10). 시각 조정 대상.
const FRAGMENT_SPACING_FACTOR = 1.5; // 파편 간격 = 이 값 × 파편 반지름 (방사 방향)
const FRAGMENT_VEL_SPREAD = 0.6; // 오프셋 단위당 방사 속도 추가분(스트림 신장)

/**
 * 조석 파괴. 블랙홀의 조석 반지름 r_t 안에 든 일반 천체를 N개 파편(DEBRIS)으로 부순다.
 *
 * r_t가 ISCO보다 바깥일 때만(찢을 여지가 있을 때만) 작동한다 — 아니면 통째로 삼켜지도록
 * 둔다. 파편은 DEBRIS라 다시 부서지지 않아 분열은 유한하다. 예산(capacity) 부족이면
 * 건너뛴다. 질량·운동량을 보존한다. 난수를 쓰지 않아 결정론적이다.
 *
 * @returns 파괴가 한 번이라도 일어났으면 true (호출자는 가속도를 다시 계산해야 한다)
 */
export function resolveTidalDisruption(b: BodyBuffer, events?: EventBuffer): boolean {
  const N = TIDAL_FRAGMENTS;
  let changed = false;

  let i = 0;
  while (i < b.count) {
    const t = b.type[i];
    if (t === BodyType.BLACK_HOLE || t === BodyType.DEBRIS) {
      i++;
      continue;
    }

    // 이 천체를 부술 블랙홀을 찾는다(첫 번째로 조건을 만족하는 것).
    let bh = -1;
    for (let j = 0; j < b.count; j++) {
      if (b.type[j] !== BodyType.BLACK_HOLE) continue;
      const rt = tidalRadius(b.radius[i], b.mass[i], b.mass[j]);
      if (rt <= iscoRadius(b.mass[j])) continue; // 찢을 껍질이 없다 — 통째 흡수하도록 둔다
      const dx = b.posX[i] - b.posX[j];
      const dy = b.posY[i] - b.posY[j];
      const dz = b.posZ[i] - b.posZ[j];
      if (dx * dx + dy * dy + dz * dz < rt * rt) {
        bh = j;
        break;
      }
    }

    if (bh === -1) {
      i++;
      continue;
    }

    // 예산: 부모 1개 제거 + 파편 N개 추가 = 순증 N-1. 넘치면 이번엔 건너뛴다.
    if (b.count + (N - 1) > b.capacity) {
      i++;
      continue;
    }

    fragment(b, i, bh, N, events);
    changed = true;
    // i를 증가시키지 않는다: removeAt이 마지막 원소를 i로 옮겼으므로 그 자리를 다시 검사한다.
  }

  return changed;
}

/** i번 천체를 bh번 블랙홀 방향으로 늘어선 N개 파편으로 대체한다. */
function fragment(b: BodyBuffer, i: number, bh: number, N: number, events?: EventBuffer): void {
  // 부모 상태를 먼저 포착한다(removeAt이 i 자리를 덮어쓴다).
  const m = b.mass[i];
  const px = b.posX[i];
  const py = b.posY[i];
  const pz = b.posZ[i];
  const vx = b.velX[i];
  const vy = b.velY[i];
  const vz = b.velZ[i];
  const cr = b.colR[i];
  const cg = b.colG[i];
  const cb = b.colB[i];

  // 블랙홀→천체 방사 단위벡터(바깥 방향).
  let ux = px - b.posX[bh];
  let uy = py - b.posY[bh];
  let uz = pz - b.posZ[bh];
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (len > 1e-9) {
    ux /= len;
    uy /= len;
    uz /= len;
  } else {
    ux = 1; // 퇴화 방어(중심과 정확히 겹침 — 사실상 도달 불가)
    uy = 0;
    uz = 0;
  }

  const mf = m / N;
  const rf = radiusFromMass(mf);
  const spacing = FRAGMENT_SPACING_FACTOR * rf;

  // 부모 제거(마지막 원소가 i 자리로 스왑) 후 파편 N개를 뒤에 붙인다.
  b.removeAt(i);

  for (let k = 0; k < N; k++) {
    const offset = k - (N - 1) / 2; // 대칭: 오프셋 합 0 → 질량중심·운동량 보존
    b.add({
      x: px + ux * offset * spacing,
      y: py + uy * offset * spacing,
      z: pz + uz * offset * spacing,
      vx: vx + ux * offset * FRAGMENT_VEL_SPREAD,
      vy: vy + uy * offset * FRAGMENT_VEL_SPREAD,
      vz: vz + uz * offset * FRAGMENT_VEL_SPREAD,
      mass: mf,
      radius: rf,
      type: BodyType.DEBRIS,
      color: [cr, cg, cb],
    });
  }

  // 찢김 순간 연출용 이벤트(위치=부모 자리, payload=질량). 물리 되먹임 없음.
  events?.push(EventKind.TIDAL, px, py, pz, m);
}
