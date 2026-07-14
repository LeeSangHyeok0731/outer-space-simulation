import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BodyData } from './Universe';

export default function SpacetimeGrid({ bodies, size = 60, segments = 60 }: { bodies: BodyData[], size?: number, segments?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // 격자 데이터 생성 (size나 segments가 변경될 때만)
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2); // X-Z 평면으로 눕힘
    return geo;
  }, [size, segments]);

  useFrame(() => {
    if (!meshRef.current) return;

    const posAttr = meshRef.current.geometry.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      
      // 원래 위치(평면)에서 시작
      let totalDeformation = 0;

      bodies.forEach(body => {
        const dx = v.x - body.position.x;
        const dz = v.z - body.position.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);
        
        // 거리에 따른 감쇄를 훨씬 급격하게 (dist^2 계열 사용)
        // 이렇게 하면 주변 격자는 평평하게 유지되면서 중심부만 수직으로 '쭉' 늘어납니다.
        // 질량이 커져도 왜곡 범위가 과하게 넓어지지 않도록 조정
        const intensity = body.type === 'blackhole' ? 5 : 2;
        const deformation = (body.mass * intensity) / (distSq * 0.5 + 1);
        totalDeformation -= deformation;
      });

      // Y축 값 업데이트
      posAttr.setY(i, totalDeformation);
    }

    posAttr.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial 
        color="#4444ff" 
        wireframe 
        transparent 
        opacity={0.3} 
      />
    </mesh>
  );
}
