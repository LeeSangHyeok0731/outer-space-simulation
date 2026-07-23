import { BodyType, MAX_BODIES } from './units';

export interface BodyInit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
  radius: number;
  type?: number;
  color?: [number, number, number];
  /** 위치가 고정된 천체. 중력은 그대로 내뿜지만 스스로는 움직이지 않는다. */
  pinned?: boolean;
  /** 커 스핀 파라미터 a* ∈ [−1, 1] (Y축 기준). 블랙홀만 의미가 있다. */
  spin?: number;
}

/**
 * 천체 상태를 SoA(Structure of Arrays)로 담는 고정 크기 버퍼.
 * 버퍼는 생성 시 한 번만 할당되며, 이후 매 프레임 할당이 발생하지 않는다.
 */
export class BodyBuffer {
  readonly capacity: number;
  count = 0;

  readonly posX: Float64Array;
  readonly posY: Float64Array;
  readonly posZ: Float64Array;
  readonly velX: Float64Array;
  readonly velY: Float64Array;
  readonly velZ: Float64Array;
  readonly accX: Float64Array;
  readonly accY: Float64Array;
  readonly accZ: Float64Array;
  readonly mass: Float64Array;
  readonly radius: Float64Array;
  readonly type: Uint8Array;
  readonly id: Int32Array;
  readonly colR: Float32Array;
  readonly colG: Float32Array;
  readonly colB: Float32Array;
  /** 1이면 위치 고정. 적분기가 이 천체의 위치·속도 갱신만 건너뛴다 (중력은 그대로 작용한다). */
  readonly pinned: Uint8Array;
  /** 커 스핀 a* ∈ [−1, 1] (Y축 기준). 프레임 끌림·스핀 의존 ISCO가 읽는다. 블랙홀만 유효. */
  readonly spin: Float64Array;

  // clear()가 이 값을 되돌리지 않는다는 것이 지켜야 할 불변식이다: 리셋 이후 스폰되는
  // 천체도 항상 새 id를 받는다. 이게 없으면 Trails의 슬롯 id나 오래된 selectedId가
  // 리셋 후 우연히 같은 숫자를 재사용하는 '다른' 천체에 조용히 다시 엮여 버린다.
  // "정리"랍시고 나중에 여기를 0/1로 되돌리면 바로 이 버그가 재발한다.
  private nextId = 1;

  constructor(capacity: number = MAX_BODIES) {
    this.capacity = capacity;
    const f = () => new Float64Array(capacity);
    this.posX = f();
    this.posY = f();
    this.posZ = f();
    this.velX = f();
    this.velY = f();
    this.velZ = f();
    this.accX = f();
    this.accY = f();
    this.accZ = f();
    this.mass = f();
    this.radius = f();
    this.type = new Uint8Array(capacity);
    this.id = new Int32Array(capacity);
    this.colR = new Float32Array(capacity);
    this.colG = new Float32Array(capacity);
    this.colB = new Float32Array(capacity);
    this.pinned = new Uint8Array(capacity);
    this.spin = f();
  }

  /** @returns 새 천체의 id. 용량이 가득 찼으면 -1. */
  add(b: BodyInit): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const id = this.nextId++;

    this.posX[i] = b.x;
    this.posY[i] = b.y;
    this.posZ[i] = b.z;
    this.velX[i] = b.vx;
    this.velY[i] = b.vy;
    this.velZ[i] = b.vz;
    this.accX[i] = 0;
    this.accY[i] = 0;
    this.accZ[i] = 0;
    this.mass[i] = b.mass;
    this.radius[i] = b.radius;
    this.type[i] = b.type ?? BodyType.NORMAL;
    this.id[i] = id;
    this.pinned[i] = b.pinned ? 1 : 0;
    this.spin[i] = b.spin ?? 0;

    const [r, g, bl] = b.color ?? [1, 1, 1];
    this.colR[i] = r;
    this.colG[i] = g;
    this.colB[i] = bl;

    return id;
  }

  /** 마지막 원소를 i번 자리로 옮겨 O(1)로 제거한다. 순서는 보존되지 않는다. */
  removeAt(i: number): void {
    const last = this.count - 1;
    if (i < 0 || i > last) return;
    if (i !== last) {
      this.posX[i] = this.posX[last];
      this.posY[i] = this.posY[last];
      this.posZ[i] = this.posZ[last];
      this.velX[i] = this.velX[last];
      this.velY[i] = this.velY[last];
      this.velZ[i] = this.velZ[last];
      this.accX[i] = this.accX[last];
      this.accY[i] = this.accY[last];
      this.accZ[i] = this.accZ[last];
      this.mass[i] = this.mass[last];
      this.radius[i] = this.radius[last];
      this.type[i] = this.type[last];
      this.id[i] = this.id[last];
      this.colR[i] = this.colR[last];
      this.colG[i] = this.colG[last];
      this.colB[i] = this.colB[last];
      this.pinned[i] = this.pinned[last];
      this.spin[i] = this.spin[last];
    }
    this.count = last;
  }

  removeById(id: number): boolean {
    const i = this.indexOfId(id);
    if (i === -1) return false;
    this.removeAt(i);
    return true;
  }

  /**
   * 선형 탐색. `CameraRig`가 선택된 천체를 추적하는 동안 매 프레임, `Trails`가
   * 추적 중인 천체마다 호출한다 — 이제 매 프레임 호출된다. 그래도 count ≤ 512로
   * 상한이 있어, 프레임당 O(N²)인 N-body 힘 계산에 비하면 무시할 수준이다.
   */
  indexOfId(id: number): number {
    for (let i = 0; i < this.count; i++) {
      if (this.id[i] === id) return i;
    }
    return -1;
  }

  clear(): void {
    this.count = 0;
  }
}
