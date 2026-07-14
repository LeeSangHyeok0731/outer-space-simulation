import type { BodyBuffer } from './bodies';

/**
 * j번 천체를 i번 천체에 흡수시킨다. 보존량:
 *   질량   m = m₁ + m₂
 *   운동량 v = (m₁v₁ + m₂v₂) / m
 *   부피   r = ∛(r₁³ + r₂³)
 * 정체성(id·색·타입)은 더 무거운 쪽을 물려받는다.
 *
 * 고정(pinned)은 예외다 — 고정이 이긴다. 한쪽이라도 고정돼 있으면 합쳐진 천체는
 * 그 고정된 위치에 그대로 머물고 속도 0으로 계속 고정 상태로 남는다. 질량만 불어난다.
 * '닻'으로 쓰려고 고정한 항성이 소행성 하나 맞았다고 풀려버리면 기능 자체가 무의미해진다.
 */
function mergeInto(b: BodyBuffer, i: number, j: number): void {
  const m1 = b.mass[i];
  const m2 = b.mass[j];
  const m = m1 + m2;
  const inv = 1 / m;

  const iPinned = b.pinned[i] === 1;
  const jPinned = b.pinned[j] === 1;
  const anyPinned = iPinned || jPinned;

  let vx = (m1 * b.velX[i] + m2 * b.velX[j]) * inv;
  let vy = (m1 * b.velY[i] + m2 * b.velY[j]) * inv;
  let vz = (m1 * b.velZ[i] + m2 * b.velZ[j]) * inv;

  let px = (m1 * b.posX[i] + m2 * b.posX[j]) * inv;
  let py = (m1 * b.posY[i] + m2 * b.posY[j]) * inv;
  let pz = (m1 * b.posZ[i] + m2 * b.posZ[j]) * inv;

  if (anyPinned) {
    // 둘 다 고정이면 무거운 쪽의 닻 위치를 남긴다.
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

  if (m2 > m1) {
    b.id[i] = b.id[j];
    b.type[i] = b.type[j];
    b.colR[i] = b.colR[j];
    b.colG[i] = b.colG[j];
    b.colB[i] = b.colB[j];
  }

  b.mass[i] = m;
  b.radius[i] = radius;
  b.posX[i] = px;
  b.posY[i] = py;
  b.posZ[i] = pz;
  b.velX[i] = vx;
  b.velY[i] = vy;
  b.velZ[i] = vz;
  b.pinned[i] = anyPinned ? 1 : 0;
}

/**
 * 거리 < 반지름 합인 쌍을 모두 병합한다.
 * @returns 병합이 한 번이라도 일어났으면 true (호출자는 가속도를 다시 계산해야 한다)
 */
export function resolveCollisions(b: BodyBuffer): boolean {
  let merged = false;

  for (let i = 0; i < b.count; i++) {
    let j = i + 1;
    while (j < b.count) {
      const dx = b.posX[j] - b.posX[i];
      const dy = b.posY[j] - b.posY[i];
      const dz = b.posZ[j] - b.posZ[i];
      const rsum = b.radius[i] + b.radius[j];

      if (dx * dx + dy * dy + dz * dz < rsum * rsum) {
        mergeInto(b, i, j);
        b.removeAt(j); // 마지막 원소가 j 자리로 온다 → j를 증가시키지 않고 다시 검사
        merged = true;
      } else {
        j++;
      }
    }
  }

  return merged;
}
