import type { BodyBuffer } from './bodies';
import {
  BodyType,
  COLLAPSE_MASS,
  EVAPORATION_FLOOR,
  HAWKING_K,
  schwarzschildRadius,
} from './units';

export function isBlackHoleAt(b: BodyBuffer, i: number): boolean {
  return b.type[i] === BodyType.BLACK_HOLE;
}

/**
 * 천체를 블랙홀로 만든다. 질량은 건드리지 않는다 — 반지름이 사건의 지평선으로 줄고
 * 색이 검게 바뀔 뿐이다.
 *
 * 중력이 변하지 않는다는 점이 중요하다. 태양을 같은 질량의 블랙홀로 바꿔도 지구 궤도는
 * 변하지 않는다. 멀리 있는 천체는 아무것도 눈치채지 못한다.
 */
export function collapseAt(b: BodyBuffer, i: number): void {
  b.type[i] = BodyType.BLACK_HOLE;
  b.radius[i] = schwarzschildRadius(b.mass[i]);
  b.colR[i] = 0;
  b.colG[i] = 0;
  b.colB[i] = 0;
}

/**
 * 임계 질량을 넘은 천체를 자동으로 붕괴시킨다.
 *
 * 병합으로 살을 찌우다 어느 순간 '탁' 하고 무너지는 순간이 이 함수에서 나온다.
 *
 * @returns 하나라도 붕괴했으면 true
 */
export function applyCollapse(b: BodyBuffer): boolean {
  let collapsed = false;

  for (let i = 0; i < b.count; i++) {
    if (b.type[i] === BodyType.BLACK_HOLE) continue;
    if (b.mass[i] < COLLAPSE_MASS) continue;

    collapseAt(b, i);
    collapsed = true;
  }

  return collapsed;
}

/**
 * 호킹 복사. `dM/dt = -K / M²`
 *
 * 작을수록 미친 듯이 빨리 증발한다(증발 시간 ∝ M³). 치트 버튼으로 만든 소행성 블랙홀은
 * 흡수 반경이 거의 0이라 아무것도 못 먹고, 증발률이 폭발해 순식간에 사라진다.
 * 밸런스를 위해 지어낸 제약이 아니라 실제 물리가 말하는 바다 — 치트를 막을 필요가 없다.
 *
 * 질량이 아주 작아지면 한 스텝의 감소량이 질량 자체를 넘어설 수 있으므로(dM/dt가 발산),
 * 바닥 아래로 내려가면 음수가 되기 전에 제거한다.
 *
 * @returns **천체가 사라졌을 때만** true (호출자는 그때만 가속도를 다시 계산하면 된다).
 *
 * 질량이 줄어드는 것만으로는 true를 반환하지 않는다. 매 서브스텝 질량 변화로
 * 가속도를 무효화하면 블랙홀이 하나만 있어도 재계산이 서브스텝당 두 번 일어나 물리
 * 비용이 2배가 된다. 한 스텝의 질량 변화는 무시할 만하고(M=3000에서 상대 변화 ~1e-13),
 * integrate()가 어차피 매 스텝 내부에서 가속도를 다시 계산하므로 다음 스텝의 힘은
 * 새 질량으로 계산된다. 반면 천체가 사라지는 것은 다른 천체들이 느끼는 힘을 실제로 바꾼다.
 */
export function applyHawking(b: BodyBuffer, dt: number): boolean {
  let removed = false;

  // 뒤에서부터 도는 이유: removeAt은 swap-remove라 마지막 원소를 빈자리로 옮긴다.
  // 앞에서부터 돌면 방금 옮겨온 원소를 건너뛰게 된다.
  for (let i = b.count - 1; i >= 0; i--) {
    if (b.type[i] !== BodyType.BLACK_HOLE) continue;

    const m = b.mass[i];
    const next = m - (HAWKING_K / (m * m)) * dt;

    if (next <= EVAPORATION_FLOOR) {
      b.removeAt(i);
      removed = true;
      continue;
    }

    b.mass[i] = next;
    b.radius[i] = schwarzschildRadius(next);
  }

  return removed;
}
