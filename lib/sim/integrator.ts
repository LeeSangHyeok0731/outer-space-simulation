import type { BodyBuffer } from './bodies';
import { BodyType, FRAME_DRAG_K, G, schwarzschildRadius, SOFTENING } from './units';

/**
 * 모든 쌍의 중력 가속도를 직접 계산한다 (O(N²)).
 * 뉴턴 3법칙 덕분에 쌍마다 한 번만 계산하고 양쪽에 반대로 더한다.
 *
 * 소프트닝: F ∝ 1/(r² + ε²)^1.5
 * r이 0에 가까워질 때 힘이 발산해 천체가 광속으로 튕겨 나가는 것을 막는다.
 */
export function computeAccelerations(b: BodyBuffer): void {
  const n = b.count;
  b.accX.fill(0, 0, n);
  b.accY.fill(0, 0, n);
  b.accZ.fill(0, 0, n);

  const eps2 = SOFTENING * SOFTENING;

  for (let i = 0; i < n; i++) {
    const xi = b.posX[i];
    const yi = b.posY[i];
    const zi = b.posZ[i];
    const mi = b.mass[i];

    for (let j = i + 1; j < n; j++) {
      const dx = b.posX[j] - xi;
      const dy = b.posY[j] - yi;
      const dz = b.posZ[j] - zi;

      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const invR = 1 / Math.sqrt(r2);
      const invR3 = invR * invR * invR;
      const s = G * invR3;

      const si = s * b.mass[j]; // i가 j에게 끌리는 가속도 계수
      const sj = s * mi;        // j가 i에게 끌리는 가속도 계수

      b.accX[i] += dx * si;
      b.accY[i] += dy * si;
      b.accZ[i] += dz * si;

      b.accX[j] -= dx * sj;
      b.accY[j] -= dy * sj;
      b.accZ[j] -= dz * sj;
    }
  }
}

/**
 * 립프로그(velocity Verlet) 한 스텝.
 *
 *   v += a·dt/2   (half kick)
 *   x += v·dt     (drift)
 *   a = f(x)      (재계산)
 *   v += a·dt/2   (half kick)
 *
 * 심플렉틱 적분기라 에너지가 장기적으로 유계다. 오일러법은 궤도를 돌수록
 * 에너지가 새어 나가 행성이 나선을 그리며 떨어지거나 튕겨 나간다.
 *
 * 전제: 호출 시 acc가 현재 위치 기준으로 유효해야 한다.
 * 천체를 추가/제거/병합한 뒤에는 반드시 computeAccelerations를 먼저 부를 것.
 * 종료 후: drift 직후 내부에서 computeAccelerations를 재호출하므로, 반환 시점에도
 * acc는 갱신된 위치 기준으로 유효한 상태로 남는다. 엔진은 다음 substep() 호출이
 * 이 상태를 그대로 물려받는다는 것에 의존한다.
 */
export function integrate(b: BodyBuffer, dt: number): void {
  const n = b.count;
  const half = dt * 0.5;

  for (let i = 0; i < n; i++) {
    // 고정된 천체는 움직이지 않는다. 가속도는 계산되지만(다른 천체를 끌어당기는 쪽은
    // 그대로 유효하다) 자신에게는 적용하지 않고, 속도도 0으로 눌러 둔다 — 고정을 풀었을 때
    // 그동안 쌓인 가속도로 갑자기 튀어나가지 않게 하기 위해서다.
    if (b.pinned[i]) {
      b.velX[i] = 0;
      b.velY[i] = 0;
      b.velZ[i] = 0;
      continue;
    }

    b.velX[i] += b.accX[i] * half;
    b.velY[i] += b.accY[i] * half;
    b.velZ[i] += b.accZ[i] * half;

    b.posX[i] += b.velX[i] * dt;
    b.posY[i] += b.velY[i] * dt;
    b.posZ[i] += b.velZ[i] * dt;
  }

  computeAccelerations(b);

  for (let i = 0; i < n; i++) {
    if (b.pinned[i]) continue;

    b.velX[i] += b.accX[i] * half;
    b.velY[i] += b.accY[i] * half;
    b.velZ[i] += b.accZ[i] * half;
  }

  applyFrameDragging(b, dt);
}

/**
 * 프레임 끌림 (렌즈-티링). 스핀하는 블랙홀 근처 물질의 속도를 스핀축(±Y) 둘레로 조금씩
 * 회전시킨다 — 각속도 `ω = FRAME_DRAG_K · a* · r_s³/(r³ + r_s³)`(중심 근처는 r_s³로 상한),
 * 스텝당 각도 `θ = ω·dt`.
 *
 * **왜 힘(v×B)이 아니라 속도 회전인가:** 순수 회전은 `|v|`를 정확히 보존한다 → 운동
 * 에너지가 안 변하고 위치도 안 옮기므로 역학적 에너지 주입이 **0**이다. 힘(가속도) 형태의
 * v×B는 이산 립프로그에서 매 스텝 `|v|`를 미세하게 키워 에너지를 펌핑했다(궤도가 폭주해
 * 천체가 튕겨 나가거나 ISCO 안으로 밀려 흡수됐다). 회전 방식은 그 불안정을 원리적으로 없앤다.
 *
 * 스핀 블랙홀이 하나도 없으면 안쪽 루프를 아예 돌지 않아 비용이 0이다.
 */
function applyFrameDragging(b: BodyBuffer, dt: number): void {
  const n = b.count;
  for (let k = 0; k < n; k++) {
    if (b.type[k] !== BodyType.BLACK_HOLE) continue;
    const spin = b.spin[k];
    if (spin === 0) continue;

    const rs = schwarzschildRadius(b.mass[k]);
    const rs3 = rs * rs * rs;
    const rate = FRAME_DRAG_K * spin * rs3;
    const xk = b.posX[k];
    const yk = b.posY[k];
    const zk = b.posZ[k];

    for (let i = 0; i < n; i++) {
      if (i === k || b.pinned[i]) continue;
      const dx = b.posX[i] - xk;
      const dy = b.posY[i] - yk;
      const dz = b.posZ[i] - zk;
      const r2 = dx * dx + dy * dy + dz * dz;
      const theta = (rate / (r2 * Math.sqrt(r2) + rs3)) * dt;

      // 속도의 XZ 성분을 스핀축(Y) 둘레로 θ만큼 회전. |v| 보존 → 에너지 주입 없음.
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const vx = b.velX[i];
      const vz = b.velZ[i];
      b.velX[i] = vx * c - vz * s;
      b.velZ[i] = vx * s + vz * c;
    }
  }
}
