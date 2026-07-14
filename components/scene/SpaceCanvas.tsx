'use client';

import { Canvas } from '@react-three/fiber';
import Bodies from './Bodies';
import Starfield from './Starfield';

export default function SpaceCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 140, 260], fov: 55, near: 0.1, far: 5000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#05070d']} />
      <Starfield />
      {/* Bodies가 engine.step()의 유일한 호출자이므로 다른 씬 요소보다 먼저 마운트한다. */}
      <Bodies />
    </Canvas>
  );
}
