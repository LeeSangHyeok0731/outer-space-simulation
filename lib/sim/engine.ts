import { BodyBuffer, type BodyInit } from './bodies';
import { applyCollapse, applyHawking, collapseAt, isBlackHoleAt } from './blackhole';
import { resolveCollisions } from './collisions';
import { computeAccelerations, integrate } from './integrator';
import { BodyType, MAX_BODIES, radiusFromMass } from './units';

/** 물리 스텝은 화면 프레임과 무관하게 항상 이 간격으로 돈다. */
export const FIXED_DT = 1 / 120;

/** 탭 복귀 등으로 dt가 튈 때 잘라내는 상한. 이걸 안 하면 시뮬레이션이 폭발한다. */
export const MAX_FRAME_DT = 0.05;

/** 프레임당 물리 스텝 상한. 초과분은 버린다(죽음의 나선 방지). */
export const MAX_SUBSTEPS = 32;

export interface SpawnOptions {
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  type?: number;
  color?: [number, number, number];
}

export interface SerializedBody extends BodyInit {
  id: number;
}

export interface SerializedState {
  simTime: number;
  bodies: SerializedBody[];
}

export class SimulationEngine {
  readonly bodies: BodyBuffer;

  timeScale = 1;
  paused = false;
  simTime = 0;

  private accumulator = 0;
  /** 천체가 추가·제거·병합되면 가속도가 낡는다. 다음 스텝 전에 다시 계산해야 한다. */
  private accDirty = true;

  constructor(capacity: number = MAX_BODIES) {
    this.bodies = new BodyBuffer(capacity);
  }

  /** @returns 새 천체의 id. 용량이 가득 찼으면 -1. */
  spawn(o: SpawnOptions): number {
    const id = this.bodies.add({
      x: o.position[0],
      y: o.position[1],
      z: o.position[2],
      vx: o.velocity[0],
      vy: o.velocity[1],
      vz: o.velocity[2],
      mass: o.mass,
      radius: radiusFromMass(o.mass),
      type: o.type ?? BodyType.NORMAL,
      color: o.color,
    });
    if (id !== -1) this.accDirty = true;
    return id;
  }

  remove(id: number): boolean {
    const removed = this.bodies.removeById(id);
    if (removed) this.accDirty = true;
    return removed;
  }

  /** 2단계(신의 손)용. 질량을 바꾸면 반지름도 따라 바뀐다. */
  setMass(id: number, mass: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    this.bodies.mass[i] = mass;
    this.bodies.radius[i] = radiusFromMass(mass);
    this.accDirty = true;
  }

  /**
   * 천체를 제자리에 고정하거나 푼다. 고정된 천체는 중력을 그대로 내뿜지만 스스로는
   * 움직이지 않는다 — 다른 천체들을 붙들어 두는 '닻'이 된다.
   *
   * 고정을 풀 때 속도가 0인 채로 풀리므로(적분기가 매 스텝 눌러 둔다) 그동안 쌓인
   * 가속도로 갑자기 튀어나가지 않는다. 그 자리에서 자연스럽게 낙하하기 시작한다.
   *
   * 가속도는 위치와 질량으로만 계산되므로 accDirty를 세울 필요가 없다.
   */
  setPinned(id: number, pinned: boolean): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    this.bodies.pinned[i] = pinned ? 1 : 0;
    if (pinned) {
      this.bodies.velX[i] = 0;
      this.bodies.velY[i] = 0;
      this.bodies.velZ[i] = 0;
    }
  }

  /** 천체가 고정돼 있는가. 없는 id면 false. */
  isPinned(id: number): boolean {
    const i = this.bodies.indexOfId(id);
    return i !== -1 && this.bodies.pinned[i] === 1;
  }

  /**
   * 신의 손 치트. 질량과 무관하게 즉시 블랙홀로 만든다.
   *
   * 물리적 근거가 없는 유일한 규칙이지만, 호킹 증발이 스스로 벌을 준다 — 작은 블랙홀은
   * 흡수 반경이 거의 0이라 아무것도 못 먹고 순식간에 증발해 사라진다.
   *
   * 질량이 변하지 않으므로 가속도는 그대로 유효하다(accDirty 불필요).
   */
  collapseToBlackHole(id: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    collapseAt(this.bodies, i);
  }

  isBlackHole(id: number): boolean {
    const i = this.bodies.indexOfId(id);
    return i !== -1 && isBlackHoleAt(this.bodies, i);
  }

  /** 4단계(우주선 추력)용. 추력 F를 dt 동안 준 효과는 dv = F/m·dt 다. */
  applyImpulse(id: number, dvx: number, dvy: number, dvz: number): void {
    const i = this.bodies.indexOfId(id);
    if (i === -1) return;
    this.bodies.velX[i] += dvx;
    this.bodies.velY[i] += dvy;
    this.bodies.velZ[i] += dvz;
  }

  /**
   * 실시간 dt를 받아 고정 스텝 물리를 필요한 횟수만큼 돌린다.
   * 배속은 누적기에 곱해진다.
   */
  step(realDt: number): void {
    if (this.paused) return;

    this.accumulator += Math.min(realDt, MAX_FRAME_DT) * this.timeScale;

    let n = 0;
    while (this.accumulator >= FIXED_DT && n < MAX_SUBSTEPS) {
      this.substep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      n++;
    }

    // 상한에 걸렸다면 밀린 시간은 버린다. 그대로 쌓으면 다음 프레임이 더 느려지고
    // 그게 다시 백로그를 키우는 죽음의 나선이 된다. 시뮬레이션이 느려질 뿐 폭발하지 않는다.
    if (n === MAX_SUBSTEPS) this.accumulator = 0;
  }

  private substep(dt: number): void {
    // 이전 프레임 이후 버퍼를 직접 건드렸을 수 있으므로(외부 주입, 잔여 오염 등)
    // 힘 계산 전에 먼저 검역한다. 여기서 거르지 않으면 오염된 위치가
    // computeAccelerations의 쌍별 계산을 타고 건강한 천체에게까지 전염된다.
    //
    // 알려진 한계(스펙 §4 참고): integrate()는 drift 직후 내부에서
    // computeAccelerations를 재호출한다. 그래서 이 시점엔 정상이던 천체가
    // drift 도중 오버플로로 오염되는 경우는 이 검역으로 막을 수 없다 —
    // 그 오염은 integrate() 내부의 재계산에서 같은 호출 안에 번지고,
    // 아래쪽 sanitize()가 전염된 건강한 천체까지 함께 제거해 버린다.
    this.sanitize();

    if (this.accDirty) {
      computeAccelerations(this.bodies);
      this.accDirty = false;
    }

    integrate(this.bodies, dt);

    // 순서가 중요하다. 병합이 질량을 바꾸므로 붕괴 검사는 병합 **뒤**에 와야
    // "항성 둘이 합쳐지는 순간 블랙홀이 된다"가 성립한다.
    if (resolveCollisions(this.bodies)) this.accDirty = true;

    // 임계 질량을 넘긴 천체가 스스로 무너진다. 질량은 그대로이므로 가속도에는
    // 영향이 없지만, 반지름이 바뀌므로 다음 충돌 판정이 달라진다.
    applyCollapse(this.bodies);

    // 호킹 증발. 천체가 사라졌을 때만 true를 반환한다 — 질량이 조금 줄어든 것만으로
    // 가속도를 무효화하면 블랙홀이 하나만 있어도 물리 비용이 2배가 된다.
    if (applyHawking(this.bodies, dt)) this.accDirty = true;
    // 이번 스텝에서 충돌/병합, 또는 integrate() 내부 오버플로로 새로 생긴
    // 오염을 잡는다. 위 주석의 한계로 인해 원래 건강했던 천체가 여기서
    // 함께 제거될 수 있다.
    this.sanitize();

    this.simTime += dt;
  }

  /**
   * NaN/Infinity로 오염된 천체를 제거한다.
   * 하나의 NaN이 다음 프레임에 모든 천체로 전염되는 것이 N-body의 전형적인 죽음이다.
   */
  private sanitize(): void {
    const b = this.bodies;
    for (let i = b.count - 1; i >= 0; i--) {
      const ok =
        Number.isFinite(b.posX[i]) &&
        Number.isFinite(b.posY[i]) &&
        Number.isFinite(b.posZ[i]) &&
        Number.isFinite(b.velX[i]) &&
        Number.isFinite(b.velY[i]) &&
        Number.isFinite(b.velZ[i]) &&
        Number.isFinite(b.mass[i]);

      if (!ok) {
        console.warn(`[sim] 오염된 천체 제거 (id=${b.id[i]})`);
        b.removeAt(i);
        this.accDirty = true;
      }
    }
  }

  reset(): void {
    this.bodies.clear();
    this.simTime = 0;
    this.accumulator = 0;
    this.accDirty = true;
  }

  serialize(): SerializedState {
    const b = this.bodies;
    const bodies: SerializedBody[] = [];
    for (let i = 0; i < b.count; i++) {
      bodies.push({
        id: b.id[i],
        x: b.posX[i],
        y: b.posY[i],
        z: b.posZ[i],
        vx: b.velX[i],
        vy: b.velY[i],
        vz: b.velZ[i],
        mass: b.mass[i],
        radius: b.radius[i],
        type: b.type[i],
        color: [b.colR[i], b.colG[i], b.colB[i]],
        pinned: b.pinned[i] === 1,
      });
    }
    return { simTime: this.simTime, bodies };
  }

  /**
   * 저장된 상태를 불러온다.
   *
   * 주의: `BodyBuffer.add()`가 항상 새 id를 발급하므로, `state.bodies[].id`는
   * 무시된다 — serialize() → load() 왕복은 id를 보존하지 않는다. 세이브/로드
   * 경계를 넘나드는 UI 상태(예: 선택된 천체 id)는 id 안정성을 가정하면 안 된다.
   */
  load(state: SerializedState): void {
    this.reset();
    for (const body of state.bodies) this.bodies.add(body);
    this.simTime = state.simTime;
    this.accDirty = true;
  }
}
