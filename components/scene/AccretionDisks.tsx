'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { BodyType, iscoRadius, MAX_BODIES } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();

/**
 * 원반의 안쪽/바깥쪽 반지름 (ISCO 배수).
 *
 * 안쪽이 정확히 1.0 = ISCO인 것이 핵심이다. 실제 강착원반의 안쪽 가장자리도 ISCO다 —
 * 그 안쪽에는 안정 궤도가 없어 물질이 머물 수 없기 때문이다. 따라서 이 테두리는
 * 예쁜 장식인 동시에 "여기 넘어오면 삼켜진다"는 경계선 그 자체다.
 */
const INNER = 1.0;
const OUTER = 2.5;

export default function AccretionDisks() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;

    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      // RingGeometry는 XY 평면에 눕는다. 황도면(XZ)으로 돌린다.
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(iscoRadius(b.mass[i]));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }

    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BODIES]} frustumCulled={false}>
      <ringGeometry args={[INNER, OUTER, 64]} />
      {/* 가산 혼합으로 빛나게 하고 블룸을 받는다. depthWrite를 끄지 않으면
          원반이 뒤쪽 천체를 가린다. */}
      <meshBasicMaterial
        color="#ff9d3c"
        side={THREE.DoubleSide}
        transparent
        opacity={0.55}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
