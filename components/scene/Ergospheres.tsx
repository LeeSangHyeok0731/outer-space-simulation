'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { BodyType, MAX_BODIES, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/** 이 값보다 스핀이 약하면 ergosphere를 그리지 않는다(정지 블랙홀엔 없다). */
const SPIN_MIN = 0.05;

/**
 * Ergosphere — 회전하는 커 블랙홀의 정적 한계면. 사건의 지평선 바깥, 적도로 부풀고
 * 극에서 오므라든 편평한 껍질이다. 이 안에서는 어떤 것도 정지해 있을 수 없고 스핀 방향으로
 * 끌려 돈다(프레임 끌림의 극한). 스핀할 때만, |a*|이 클수록 크고 진하게 나타난다.
 *
 * 정지 블랙홀(a*=0)엔 ergosphere가 없다 — 그래서 이 껍질 자체가 "이 블랙홀은 돈다"는 표시다.
 */
export default function Ergospheres() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;

    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;
      const s = Math.abs(b.spin[i]);
      if (s < SPIN_MIN) continue;

      const rs = schwarzschildRadius(b.mass[i]);
      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.rotation.set(0, 0, 0);
      // 적도(XZ)로 부풀고 극(Y)에서 오므라든 편평 껍질. 크기 ∝ |a*|.
      dummy.scale.set((1 + s) * rs, (0.5 + 0.3 * s) * rs, (1 + s) * rs);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);

      const glow = 0.15 + 0.5 * s; // 스핀할수록 진하게
      color.setRGB(glow * 0.5, glow * 0.7, glow); // 푸르스름
      mesh.setColorAt(n, color);
      n++;
    }

    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BODIES]} frustumCulled={false}>
      <sphereGeometry args={[1, 24, 16]} />
      {/* 희미한 껍질. 안쪽 면을 보여(BackSide) 감싸는 안개처럼 보이고 뒤 천체를 안 가린다.
          가산 혼합은 강착원반만의 예외라 쓰지 않는다. */}
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.16}
        depthWrite={false}
        toneMapped={false}
        side={THREE.BackSide}
      />
    </instancedMesh>
  );
}
