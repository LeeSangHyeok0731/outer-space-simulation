'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { EventKind } from '@/lib/sim/events';
import { iscoRadius, radiusFromMass, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

const MAX_EFFECTS = 32; // 동시에 살아 있는 효과 수 상한(풀 크기)
const FLASH_DURATION = 0.5; // 초
const RIPPLE_DURATION = 1.0; // 초

interface Effect {
  x: number;
  y: number;
  z: number;
  age: number;
  scale: number; // payload에서 정한 기준 크기
  active: boolean;
}

function makePool(): Effect[] {
  return Array.from({ length: MAX_EFFECTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    scale: 0,
    active: false,
  }));
}

function spawn(pool: Effect[], x: number, y: number, z: number, scale: number): void {
  const slot = pool.find((e) => !e.active);
  if (!slot) return; // 풀이 가득 차면 이번 효과는 버린다
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.scale = scale;
  slot.age = 0;
  slot.active = true;
}

/**
 * 물리 이벤트(증발 소멸, 블랙홀 병합)를 시각효과로 그린다.
 *
 * 엔진의 이벤트 버퍼를 매 프레임 읽어 풀에 스폰하고, 각 효과는 스스로 나이 들어 사라진다.
 * Bodies 뒤에 마운트해야 같은 프레임의 이벤트를 본다. 엔진을 읽기만 한다.
 *
 * 발광은 toneMapped=false + Bloom(강착원반과 달리 AdditiveBlending을 쓰지 않는다).
 * 섬광은 sin 포락선으로 크기가 0→최대→0이 되어 깨끗이 사라진다.
 */
export default function EffectsController() {
  const { engine } = useSimulation();
  const flashRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.InstancedMesh>(null);
  const flashes = useRef<Effect[]>(makePool());
  const ripples = useRef<Effect[]>(makePool());

  useFrame((_, delta) => {
    const flashMesh = flashRef.current;
    const rippleMesh = rippleRef.current;
    if (!flashMesh || !rippleMesh) return;

    // 1) 이번 프레임의 이벤트를 풀에 스폰한다.
    const ev = engine.events;
    for (let k = 0; k < ev.count; k++) {
      if (ev.kind[k] === EventKind.EVAPORATION) {
        // 사건의 지평선을 기준 크기로 삼되 하한을 보장한다. 증발은 늘 바닥 질량 근처에서
        // 일어나 r_s가 아주 작으므로 실제로는 하한(0.5)이 이겨 섬광 크기가 사실상 일정하다.
        // payload 계수는 나중에 질량 차이를 보이게 키울 여지로 남겨 둔다.
        const size = Math.max(schwarzschildRadius(ev.payload[k]), 0.5) * 4;
        spawn(flashes.current, ev.x[k], ev.y[k], ev.z[k], size);
      } else if (ev.kind[k] === EventKind.MERGE) {
        // 잔여 질량의 ISCO를 잔물결 최종 반경 기준으로 쓴다.
        spawn(ripples.current, ev.x[k], ev.y[k], ev.z[k], iscoRadius(ev.payload[k]) * 3);
      } else if (ev.kind[k] === EventKind.TIDAL) {
        // 찢김 순간 밝은 섬광 버스트. 크기는 부서진 천체 질량에 비례해, 파편 스트림이
        // 실제로 늘어나는 것을 시각적으로 강조한다(증발 섬광보다 크게 보인다).
        const size = Math.max(radiusFromMass(ev.payload[k]), 0.5) * 5;
        spawn(flashes.current, ev.x[k], ev.y[k], ev.z[k], size);
      }
    }

    // 2) 섬광: sin 포락선으로 커졌다 사라지고, 색이 밝음→어둠으로 식는다.
    let n = 0;
    for (const f of flashes.current) {
      if (!f.active) continue;
      f.age += delta;
      const t = f.age / FLASH_DURATION;
      if (t >= 1) {
        f.active = false;
        continue;
      }
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(f.scale * Math.sin(t * Math.PI), 1e-4));
      dummy.updateMatrix();
      flashMesh.setMatrixAt(n, dummy.matrix);
      const glow = (1 - t) * 3; // 1을 넘겨 블룸을 받게 한다
      color.setRGB(glow, glow * 0.95, glow * 0.8);
      flashMesh.setColorAt(n, color);
      n++;
    }
    flashMesh.count = n;
    flashMesh.visible = n > 0;
    flashMesh.instanceMatrix.needsUpdate = true;
    if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;

    // 3) 잔물결: 반경이 0→최종으로 퍼지고 색이 식는다.
    let m = 0;
    for (const r of ripples.current) {
      if (!r.active) continue;
      r.age += delta;
      const t = r.age / RIPPLE_DURATION;
      if (t >= 1) {
        r.active = false;
        continue;
      }
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0); // 황도면(XZ)에 눕힌다
      dummy.scale.setScalar(Math.max(r.scale * t, 1e-4));
      dummy.updateMatrix();
      rippleMesh.setMatrixAt(m, dummy.matrix);
      const glow = (1 - t) * (1 - t) * 2.5; // 빨리 식는다
      color.setRGB(glow, glow * 0.8, glow * 0.5);
      rippleMesh.setColorAt(m, color);
      m++;
    }
    rippleMesh.count = m;
    rippleMesh.visible = m > 0;
    rippleMesh.instanceMatrix.needsUpdate = true;
    if (rippleMesh.instanceColor) rippleMesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={flashRef} args={[undefined, undefined, MAX_EFFECTS]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rippleRef} args={[undefined, undefined, MAX_EFFECTS]} frustumCulled={false}>
        <ringGeometry args={[0.85, 1.0, 48]} />
        <meshBasicMaterial
          side={THREE.DoubleSide}
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
