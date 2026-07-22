/**
 * 시뮬레이션이 씬에 알리는 일회성 사건의 종류.
 * 확장 가능한 enum이다 — 이후 자동 붕괴 섬광 등이 여기 붙는다.
 */
export const EventKind = {
  EVAPORATION: 0,
  MERGE: 1,
  TIDAL: 2,
  /** 블랙홀이 일반 천체를 ISCO 안으로 삼킴. 제트 플레어가 이걸 듣는다. */
  ISCO_ABSORB: 3,
} as const;

export type EventKindValue = (typeof EventKind)[keyof typeof EventKind];

/**
 * 한 프레임 동안 일어난 사건들을 담는 사전할당 버퍼(SoA).
 *
 * 엔진이 소유하고 매 스텝 시작에서 비운다. 씬이 그 프레임에 한 번 읽어 시각효과를 스폰한다.
 * 이벤트는 시뮬레이션 상태로 **되먹임되지 않는다** — 순수한 알림이라 결정론에 영향이 없다.
 */
export class EventBuffer {
  readonly kind: Uint8Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly payload: Float64Array;
  readonly capacity: number;
  count = 0;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.kind = new Uint8Array(capacity);
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.z = new Float64Array(capacity);
    this.payload = new Float64Array(capacity);
  }

  push(kind: EventKindValue, x: number, y: number, z: number, payload: number): void {
    // 넘치면 조용히 버린다. 한 프레임에 이만큼 사건이 몰리는 일은 드물고,
    // 몇 개 누락돼도 시각효과일 뿐이라 무해하다.
    if (this.count >= this.capacity) return;
    const i = this.count;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.payload[i] = payload;
    this.count++;
  }

  clear(): void {
    this.count = 0;
  }
}
