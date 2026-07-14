'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAX_BODIES } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

/** 고리 하나를 이루는 선분 개수. 32이면 충분히 둥글어 보인다. */
const SEGMENTS = 32;
/** 천체 반지름의 몇 배 크기로 고리를 그릴지. */
const RING_SCALE = 1.6;

/**
 * 고정된 천체 주위에 그리는 얼어붙은 닻 표시.
 *
 * 고정될 수 있는 천체 수에 상한이 없으므로 최악의 경우(전부 고정) 512개를 감당해야 한다.
 * 512개의 개별 Line은 draw call 512회가 되므로, 전부 하나의 LineSegments 버퍼에 담아
 * draw call 1회로 그린다. Bodies/Trails와 같은 방식이다.
 */
const VERTS = MAX_BODIES * SEGMENTS * 2;

export default function PinMarkers() {
  const { engine } = useSimulation();
  const meshRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  // geometry.getAttribute()는 유니온 타입을 돌려주므로 캐스팅을 부르게 된다.
  // SpawnController/Trails와 같은 방식으로, 우리가 만든 BufferAttribute를 직접 들고 쓴다.
  const posAttr = useRef(new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));

  useEffect(() => {
    geometry.setAttribute('position', posAttr.current);
    return () => geometry.dispose();
  }, [geometry]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const b = engine.bodies;
    const arr = posAttr.current.array as Float32Array;

    let v = 0;
    for (let i = 0; i < b.count; i++) {
      if (!b.pinned[i]) continue;

      const x = b.posX[i];
      const y = b.posY[i];
      const z = b.posZ[i];
      const r = b.radius[i] * RING_SCALE;

      // 황도면에 눕힌 고리. 천체가 어디에 있든 위에서 보면 바로 눈에 띈다.
      for (let s = 0; s < SEGMENTS; s++) {
        const a0 = (s / SEGMENTS) * Math.PI * 2;
        const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;

        arr[v * 3] = x + Math.cos(a0) * r;
        arr[v * 3 + 1] = y;
        arr[v * 3 + 2] = z + Math.sin(a0) * r;
        v++;

        arr[v * 3] = x + Math.cos(a1) * r;
        arr[v * 3 + 1] = y;
        arr[v * 3 + 2] = z + Math.sin(a1) * r;
        v++;
      }
    }

    posAttr.current.needsUpdate = true;
    geometry.setDrawRange(0, v);
    mesh.visible = v > 0;
  });

  return (
    <lineSegments ref={meshRef} geometry={geometry} frustumCulled={false}>
      {/* 천체 색과 겹치지 않는 호박색. 블룸이 받아 은은하게 빛난다. */}
      <lineBasicMaterial color="#fbbf24" transparent opacity={0.9} toneMapped={false} />
    </lineSegments>
  );
}
