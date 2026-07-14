'use client';

import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { useSimulation } from '@/state/SimulationProvider';

const target = new THREE.Vector3();

export default function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { engine, selectedId } = useSimulation();

  useFrame(() => {
    if (selectedId === null || !controls.current) return;

    const b = engine.bodies;
    const i = b.indexOfId(selectedId);
    if (i === -1) return;

    // 선택된 천체를 부드럽게 따라간다.
    target.set(b.posX[i], b.posY[i], b.posZ[i]);
    controls.current.target.lerp(target, 0.1);
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={2000}
      // 왼쪽 버튼은 던지기가 쓴다. LEFT를 비워두면 OrbitControls가 무시한다.
      mouseButtons={{
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
    />
  );
}
