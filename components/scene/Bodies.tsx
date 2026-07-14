'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useSimulation } from '@/state/SimulationProvider';
import { MAX_BODIES } from '@/lib/sim/units';

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const dummy = new THREE.Object3D();
const color = new THREE.Color();

const STATS_INTERVAL = 0.1; // 10Hz

export default function Bodies() {
  const { engine, bodiesMeshRef, setStats } = useSimulation();
  const statsTimer = useRef(0);
  const fpsEma = useRef(60);

  useFrame((_, delta) => {
    // 엔진 stepping의 유일한 주인. 다른 컴포넌트는 읽기만 한다.
    engine.step(delta);

    const mesh = bodiesMeshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    mesh.count = b.count;

    for (let i = 0; i < b.count; i++) {
      dummy.position.set(b.posX[i], b.posY[i], b.posZ[i]);
      dummy.scale.setScalar(b.radius[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.setRGB(b.colR[i], b.colG[i], b.colB[i]);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // setMatrixAt은 boundingSphere를 무효화하지 않는다. frustumCulled={false}라 렌더러도
    // 건드리지 않으므로, 비워두지 않으면 첫 클릭 때 계산된 구가 영구히 고정되어
    // 그 밖으로 나간 천체는 레이캐스트에 잡히지 않는다 (= 클릭해도 선택되지 않는다).
    mesh.boundingSphere = null;

    // 표시용 수치는 매 프레임이 아니라 10Hz로만 React에 밀어 올린다.
    const instFps = delta > 0 ? 1 / delta : 0;
    fpsEma.current = fpsEma.current * 0.9 + instFps * 0.1;

    statsTimer.current += delta;
    if (statsTimer.current >= STATS_INTERVAL) {
      statsTimer.current = 0;
      setStats({
        count: b.count,
        simTime: engine.simTime,
        fps: Math.round(fpsEma.current),
      });
    }
  });

  return (
    <instancedMesh
      ref={bodiesMeshRef}
      args={[undefined, undefined, MAX_BODIES]}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 3]} />
      {/* 발광체처럼 보이도록 조명 계산 없이 원색을 그대로 낸다. 블룸이 나머지를 한다. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
