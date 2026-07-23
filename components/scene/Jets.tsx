'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EventKind } from '@/lib/sim/events';
import { BodyType, iscoRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

/** 제트를 그리는 블랙홀 수 상한. 초과분은 제트가 안 그려진다. */
const MAX_JET_BHS = 24;

/** 제트 길이·굵기(ISCO 배수). */
const JET_LENGTH = 5;
const JET_WIDTH = 0.45;

/** 평상시 제트 밝기. 흡수하면 flare가, 스핀하면 스핀 게인이 얹힌다. */
const BASE_INTENSITY = 0.15;
/** 스핀 연동. 빠르게 도는 블랙홀일수록 제트가 세진다(블랜포드-즈나젝의 정성적 반영). */
const JET_SPIN_GAIN = 0.6;
const JET_SPIN_LENGTH = 0.6;
/** 흡수 한 번당 flare 증가량과 상한. */
const FLARE_BUMP = 0.8;
const FLARE_MAX = 1.3;
/** flare가 초당 줄어드는 양(실시간). 클수록 빨리 잦아든다. */
const FLARE_DECAY_RATE = 1.8;
/** flare가 최대일 때 제트가 몇 배까지 길어지는가. */
const FLARE_LENGTH = 0.5;

/** 청백색 기본 색. intensity를 곱해 밝기를 낸다. */
const BASE_R = 0.5;
const BASE_G = 0.7;
const BASE_B = 1.0;

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/**
 * 블랙홀 극(±Y)에서 뿜는 쌍둥이 상대론적 제트.
 *
 * 강착원반이 황도면(XZ)에 눕으므로 제트축은 그 수직인 ±Y다. 평소엔 희미하고,
 * 블랙홀이 천체를 삼킬 때(ISCO_ABSORB 이벤트) 그 블랙홀의 제트가 확 밝아졌다
 * 서서히 잦아든다. flare는 블랙홀 id로 추적한다(id는 재사용되지 않는다).
 *
 * 시점 의존이 없어 InstancedMesh로 그린다(블랙홀당 2개). Bodies 뒤에 마운트해
 * 같은 프레임에 갱신된 상태·이벤트를 읽는다.
 */
export default function Jets() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // 블랙홀 id → flare 세기. 흡수하면 오르고 매 프레임 감쇠한다.
  const flares = useRef<Map<number, number>>(new Map());

  // 밑동(apex)을 원점에, 벌어지는 base를 +Y로 둔 슬렌더 원뿔. 아래 제트는 인스턴스에서 뒤집는다.
  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(JET_WIDTH, 1, 20, 1, true);
    g.rotateX(Math.PI); // apex를 아래로
    g.translate(0, 0.5, 0); // apex를 원점, base를 +Y로
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    const f = flares.current;

    // 1) 기존 flare 감쇠(실시간). 0 이하가 되면 버린다.
    for (const [id, v] of f) {
      const next = v - FLARE_DECAY_RATE * delta;
      if (next <= 0) f.delete(id);
      else f.set(id, next);
    }

    // 2) 이번 프레임 흡수 이벤트마다 가장 가까운 블랙홀의 flare를 올린다.
    const ev = engine.events;
    for (let k = 0; k < ev.count; k++) {
      if (ev.kind[k] !== EventKind.ISCO_ABSORB) continue;
      let bestId = -1;
      let bestD2 = Infinity;
      for (let i = 0; i < b.count; i++) {
        if (b.type[i] !== BodyType.BLACK_HOLE) continue;
        const dx = b.posX[i] - ev.x[k];
        const dy = b.posY[i] - ev.y[k];
        const dz = b.posZ[i] - ev.z[k];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = b.id[i];
        }
      }
      if (bestId !== -1) {
        f.set(bestId, Math.min(FLARE_MAX, (f.get(bestId) ?? 0) + FLARE_BUMP));
      }
    }

    // 3) 블랙홀마다 제트 두 개(±Y)의 행렬·색을 채운다.
    let bh = 0;
    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;
      if (bh >= MAX_JET_BHS) break;
      bh++;

      const isco = iscoRadius(b.mass[i]);
      const spinMag = Math.abs(b.spin[i]);
      const flare = f.get(b.id[i]) ?? 0;
      const intensity = BASE_INTENSITY + JET_SPIN_GAIN * spinMag + flare;
      const length = isco * JET_LENGTH * (1 + JET_SPIN_LENGTH * spinMag + flare * FLARE_LENGTH);
      const width = isco * JET_WIDTH;

      color.setRGB(BASE_R * intensity, BASE_G * intensity, BASE_B * intensity);

      // 위쪽 제트(+Y)
      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(width, length, width);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, color);
      n++;

      // 아래쪽 제트(−Y): X축 180° 회전
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, color);
      n++;
    }

    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_JET_BHS * 2]}
      frustumCulled={false}
    >
      {/* 청백색 발광 빔. 밝기는 instanceColor로 준다. 블룸으로 빛난다.
          가산 혼합은 강착원반만의 예외라 쓰지 않는다. depthWrite를 끄지 않으면 뒤 천체를 가린다. */}
      <meshBasicMaterial
        color="#ffffff"
        side={THREE.DoubleSide}
        transparent
        opacity={0.5}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
