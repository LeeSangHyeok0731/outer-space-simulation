import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BodyData } from './Universe';

export default function OrbitPath({ body }: { body: BodyData }) {
  const lineRef = useRef<THREE.Line>(null);
  const maxPoints = 500;
  const points = useMemo(() => {
    const p = new Array(maxPoints).fill(0).map(() => body.position.clone());
    return p;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, []);

  useFrame(() => {
    if (!lineRef.current) return;

    // 점들을 하나씩 뒤로 밀고 현재 위치를 맨 앞에 추가
    for (let i = maxPoints - 1; i > 0; i--) {
      points[i].copy(points[i - 1]);
    }
    points[0].copy(body.position);

    lineRef.current.geometry.setFromPoints(points);
  });

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial color={body.color} transparent opacity={0.4} />
    </line>
  );
}
