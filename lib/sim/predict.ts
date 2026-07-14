import type { BodyBuffer } from './bodies';
import { G, SOFTENING } from './units';

/**
 * 던지려는 천체 하나가 그릴 궤적을 미리 계산한다.
 *
 * 기존 천체들은 **정지해 있다고 가정**한다(중력장 고정). 짧은 예측 구간에서는
 * 충분히 정확하고, N번의 O(N²)가 아니라 O(steps·N)이라 드래그 중에도 공짜에 가깝다.
 * 탐침의 질량은 기존 천체에 영향을 주지 않으므로 필요 없다.
 *
 * @param out 미리 할당된 버퍼. 길이/3 만큼의 점을 채운다. (useFrame 중 할당 금지)
 * @returns 실제로 채운 점의 개수. 충돌하면 그 지점에서 멈춘다.
 */
export function predictTrajectory(
  bodies: BodyBuffer,
  start: [number, number, number],
  vel: [number, number, number],
  out: Float32Array,
  dt = 1 / 60,
): number {
  const maxPoints = Math.floor(out.length / 3);
  const eps2 = SOFTENING * SOFTENING;
  const n = bodies.count;

  let px = start[0];
  let py = start[1];
  let pz = start[2];
  let vx = vel[0];
  let vy = vel[1];
  let vz = vel[2];

  for (let s = 0; s < maxPoints; s++) {
    let ax = 0;
    let ay = 0;
    let az = 0;

    for (let i = 0; i < n; i++) {
      const dx = bodies.posX[i] - px;
      const dy = bodies.posY[i] - py;
      const dz = bodies.posZ[i] - pz;

      const dist2 = dx * dx + dy * dy + dz * dz;

      // 기존 천체 표면에 닿으면 궤적을 끊는다
      if (dist2 < bodies.radius[i] * bodies.radius[i]) return s;

      const r2 = dist2 + eps2;
      const invR = 1 / Math.sqrt(r2);
      const f = G * bodies.mass[i] * invR * invR * invR;

      ax += dx * f;
      ay += dy * f;
      az += dz * f;
    }

    // 세미-임플리시트 오일러. 예측 구간이 짧아 이 정도면 충분하다.
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    out[s * 3] = px;
    out[s * 3 + 1] = py;
    out[s * 3 + 2] = pz;
  }

  return maxPoints;
}
