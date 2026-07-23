import type { BodyBuffer } from './bodies';
import { EventKind, type EventBuffer } from './events';
import { BodyType, iscoRadius, mergeKickSpeed, schwarzschildRadius } from './units';

/**
 * 두 천체가 합쳐지는 거리.
 *
 * 일반 천체끼리는 표면이 닿을 때(반지름 합)다. 블랙홀은 다르다 — **ISCO 안에 들어오면
 * 속도와 무관하게 삼켜진다.** 뉴턴 중력에서는 아무리 가까워도 빠르기만 하면 궤도를 돌 수
 * 있지만, 실제 블랙홀 근처(3 r_s 안쪽)에는 안정 궤도가 존재하지 않고 무엇이든 나선을
 * 그리며 빨려든다. 이 한 줄이 블랙홀을 '검은 항성'이 아니게 만든다.
 */
function captureDistance(b: BodyBuffer, i: number, j: number): number {
  const iBH = b.type[i] === BodyType.BLACK_HOLE;
  const jBH = b.type[j] === BodyType.BLACK_HOLE;

  if (!iBH && !jBH) return b.radius[i] + b.radius[j];

  // 블랙홀이 둘이면 더 큰 ISCO가 이긴다.
  let d = 0;
  if (iBH) d = Math.max(d, iscoRadius(b.mass[i]));
  if (jBH) d = Math.max(d, iscoRadius(b.mass[j]));
  return d;
}

/**
 * j번 천체를 i번 천체에 흡수시킨다. 보존량:
 *   질량   m = m₁ + m₂
 *   운동량 v = (m₁v₁ + m₂v₂) / m
 *
 * 정체성(id·색·타입)과 반지름은 블랙홀 여부에 따라 다르다:
 *   - 블랙홀이 관여하면: 정체성은 블랙홀이 승리, 반지름은 사건의 지평선
 *   - 일반 천체끼리면: 정체성은 무거운 쪽이 승리, 반지름은 부피 보존 r = ∛(r₁³ + r₂³)
 *
 * 고정(pinned)은 예외다 — 고정이 이긴다. 한쪽이라도 고정돼 있으면 합쳐진 천체는
 * 그 고정된 위치에 그대로 머물고 속도 0으로 계속 고정 상태로 남는다. 질량만 불어난다.
 * '닻'으로 쓰려고 고정한 항성이 소행성 하나 맞았다고 풀려버리면 기능 자체가 무의미해진다.
 */
function mergeInto(b: BodyBuffer, i: number, j: number, events?: EventBuffer): void {
  const m1 = b.mass[i];
  const m2 = b.mass[j];
  const m = m1 + m2;
  const inv = 1 / m;

  const iBH = b.type[i] === BodyType.BLACK_HOLE;
  const jBH = b.type[j] === BodyType.BLACK_HOLE;
  const anyBH = iBH || jBH;
  const bothBH = iBH && jBH;

  const iPinned = b.pinned[i] === 1;
  const jPinned = b.pinned[j] === 1;
  const anyPinned = iPinned || jPinned;

  let vx = (m1 * b.velX[i] + m2 * b.velX[j]) * inv;
  let vy = (m1 * b.velY[i] + m2 * b.velY[j]) * inv;
  let vz = (m1 * b.velZ[i] + m2 * b.velZ[j]) * inv;

  let px = (m1 * b.posX[i] + m2 * b.posX[j]) * inv;
  let py = (m1 * b.posY[i] + m2 * b.posY[j]) * inv;
  let pz = (m1 * b.posZ[i] + m2 * b.posZ[j]) * inv;

  // 블랙홀 쌍성 병합의 중력파 반동(킥). 운동량 보존 속도 위에 더한다 —
  // 중력파가 운동량을 실어 나르므로 잔여 블랙홀은 반동한다(운동량은 깨진다, 그게 맞다).
  // 방향은 병합 직전 상대속도(궤도면 방향)로 근사한다. 스핀이 없어 방향만 근사이고,
  // 크기 법칙(mergeKickSpeed, 피치트)은 근사가 아니라 실제 물리다.
  if (bothBH) {
    const rvx = b.velX[j] - b.velX[i];
    const rvy = b.velY[j] - b.velY[i];
    const rvz = b.velZ[j] - b.velZ[i];
    const rspeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    if (rspeed > 1e-9) {
      const k = mergeKickSpeed(m1, m2) / rspeed; // 정규화 + 크기
      vx += rvx * k;
      vy += rvy * k;
      vz += rvz * k;
    }
  }

  if (anyPinned) {
    // 고정이 이긴다: 킥도 운동량도 무시하고 닻 위치에 속도 0으로 멈춘다.
    const anchor = iPinned && jPinned ? (m2 > m1 ? j : i) : iPinned ? i : j;
    px = b.posX[anchor];
    py = b.posY[anchor];
    pz = b.posZ[anchor];
    vx = 0;
    vy = 0;
    vz = 0;
  }

  const r1 = b.radius[i];
  const r2 = b.radius[j];
  const radius = Math.cbrt(r1 * r1 * r1 + r2 * r2 * r2);

  // 정체성(id·색·타입): 보통은 무거운 쪽이 이기지만, 블랙홀이 있으면 블랙홀이 이긴다.
  const takeJ = iBH !== jBH ? jBH : m2 > m1;
  if (takeJ) {
    b.id[i] = b.id[j];
    b.type[i] = b.type[j];
    b.colR[i] = b.colR[j];
    b.colG[i] = b.colG[j];
    b.colB[i] = b.colB[j];
  }

  b.mass[i] = m;

  if (anyBH) {
    b.type[i] = BodyType.BLACK_HOLE;
    b.radius[i] = schwarzschildRadius(m);
    b.colR[i] = 0;
    b.colG[i] = 0;
    b.colB[i] = 0;
  } else {
    b.radius[i] = radius;
  }
  b.posX[i] = px;
  b.posY[i] = py;
  b.posZ[i] = pz;
  b.velX[i] = vx;
  b.velY[i] = vy;
  b.velZ[i] = vz;
  b.pinned[i] = anyPinned ? 1 : 0;

  // 블랙홀 쌍성 병합은 잔물결(MERGE), 블랙홀이 일반 천체를 삼키면 흡수 플레어(ISCO_ABSORB).
  // 둘 다 위치는 잔여 블랙홀 자리(pinned면 닻), payload는 잔여 질량. 씬이 각각 다른 시각효과
  // (중력파 링 / 극 제트 플레어)로 반응한다.
  if (bothBH) {
    events?.push(EventKind.MERGE, px, py, pz, m);
  } else if (anyBH) {
    events?.push(EventKind.ISCO_ABSORB, px, py, pz, m);
  }
}

/**
 * 거리 < 반지름 합인 쌍을 모두 병합한다.
 * @returns 병합이 한 번이라도 일어났으면 true (호출자는 가속도를 다시 계산해야 한다)
 */
export function resolveCollisions(b: BodyBuffer, events?: EventBuffer): boolean {
  let merged = false;

  for (let i = 0; i < b.count; i++) {
    let j = i + 1;
    while (j < b.count) {
      const dx = b.posX[j] - b.posX[i];
      const dy = b.posY[j] - b.posY[i];
      const dz = b.posZ[j] - b.posZ[i];
      const capture = captureDistance(b, i, j);

      if (dx * dx + dy * dy + dz * dz < capture * capture) {
        mergeInto(b, i, j, events);
        b.removeAt(j); // 마지막 원소가 j 자리로 온다 → j를 증가시키지 않고 다시 검사
        merged = true;
      } else {
        j++;
      }
    }
  }

  return merged;
}
