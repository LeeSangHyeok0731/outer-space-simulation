import React, { useRef, useState, useMemo } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BodyData } from './Universe';

interface CelestialBodyProps extends BodyData {
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export default function CelestialBody({ position, radius, color, id, type, onPointerDown }: CelestialBodyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // 블랙홀 모델 로드 (선택 사항)
  const { scene: blackHoleModel } = useGLTF('/3D/black_hole_project.glb', true);
  const modelClone = useMemo(() => blackHoleModel?.clone(), [blackHoleModel]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(position);
      if (type !== 'blackhole') {
        meshRef.current.rotation.y += 0.01;
      }
    }
    if (type === 'blackhole' && modelClone) {
      modelClone.position.copy(position);
      modelClone.rotation.y += 0.02;
    }
  });

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const onPointerOut = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  return (
    <group>
      {type === 'blackhole' && modelClone ? (
        <primitive 
          object={modelClone} 
          scale={radius * 2}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        />
      ) : (
        <mesh 
          ref={meshRef} 
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        >
          <sphereGeometry args={[radius, 32, 32]} />
          <meshStandardMaterial 
            color={type === 'blackhole' ? 'black' : color} 
            emissive={type === 'star' ? color : (hovered ? 'white' : 'black')} 
            emissiveIntensity={type === 'star' ? 2 : (hovered ? 0.5 : 0)}
            roughness={type === 'blackhole' ? 0 : 0.5}
            metalness={type === 'blackhole' ? 1 : 0}
          />
        </mesh>
      )}

      {/* 블랙홀일 때 입자형 강착 원반 연출 */}
      {type === 'blackhole' && (
        <InterstellarDisk position={position} radius={radius} />
      )}
    </group>
  );
}

function InterstellarDisk({ position, radius }: { position: THREE.Vector3, radius: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const horizontalDiskRef = useRef<THREE.Points>(null);
  const verticalDiskRef = useRef<THREE.Points>(null);
  
  const particleConfig = useMemo(() => {
    const count = 3000;
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const r = radius * 2.5 + Math.random() * radius * 7;
      const angle = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (radius * 0.1); 
      pos[i * 3 + 2] = Math.sin(angle) * r;
      const t = 1 - (r - radius * 2.5) / (radius * 7);
      colors[i * 3] = 1; 
      colors[i * 3 + 1] = 0.4 + t * 0.6; 
      colors[i * 3 + 2] = t * 0.3;
    }
    return { pos, colors };
  }, [radius]);

  useFrame((state) => {
    if (groupRef.current) groupRef.current.position.copy(position);
    if (horizontalDiskRef.current) horizontalDiskRef.current.rotation.y += 0.04;
    if (verticalDiskRef.current) verticalDiskRef.current.rotation.y += 0.04;
  });

  return (
    <group ref={groupRef}>
      <points ref={horizontalDiskRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particleConfig.pos.length / 3} array={particleConfig.pos} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={particleConfig.colors.length / 3} array={particleConfig.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.1} vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </points>
      <points ref={verticalDiskRef} rotation={[Math.PI / 2, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particleConfig.pos.length / 3} array={particleConfig.pos} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={particleConfig.colors.length / 3} array={particleConfig.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.08} vertexColors transparent opacity={0.4} blending={THREE.AdditiveBlending} />
      </points>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.2, radius * 8, 64]} />
        <meshBasicMaterial color="#ff5500" transparent opacity={0.1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/3D/black_hole_project.glb');
