'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { BodyType, MAX_BODIES, PHOTON_SPHERE_FACTOR, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();

/**
 * 광자 구 링. 블랙홀마다 1.5 r_s에 얇고 밝은 링을 그린다.
 *
 * 이 반지름에서 빛은 블랙홀을 궤도로 돈다 — 블랙홀 이미지(EHT·인터스텔라)에서
 * 그림자를 감싸는 밝은 테두리가 이것이다. 매 프레임 카메라를 향하도록 정렬해
 * (RingGeometry 법선이 +Z, lookAt이 +Z를 카메라로 향하게 한다) 구의 실루엣처럼
 * 보이고, 황도면에 누운 강착원반과 구별된다.
 *
 * 광자 구(1.5 r_s)는 ISCO(3 r_s = 강착원반 안쪽)보다 안쪽, 사건의 지평선(r_s = 검은 구)보다
 * 바깥이라 검은 구를 바로 감싼다. Bodies 뒤에 마운트해 같은 프레임 상태를 읽는다.
 */
export default function PhotonSpheres() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    const cam = state.camera;

    let n = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.lookAt(cam.position); // 링이 카메라를 마주보게 한다
      dummy.scale.setScalar(PHOTON_SPHERE_FACTOR * schwarzschildRadius(b.mass[i]));
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
      <ringGeometry args={[0.92, 1.0, 64]} />
      {/* 밝은 흰빛. 블룸을 받도록 toneMapped를 끈다. AdditiveBlending은 쓰지 않는다
          (강착원반이 유일 예외). depthWrite를 끄지 않으면 뒤 천체를 가린다. */}
      <meshBasicMaterial
        color="#eaf2ff"
        side={THREE.DoubleSide}
        transparent
        opacity={0.9}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
