'use client';

import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import Bodies from './Bodies';
import CameraRig from './CameraRig';
import SpawnController from './SpawnController';
import Starfield from './Starfield';
import Trails from './Trails';

export default function SpaceCanvas() {
  return (
    <Canvas
      // 카메라는 시작 항성계 전체(항성 + 행성 3개 + 반지름 200~230의 소행성 띠 60개)를
      // 여유를 두고 담도록 맞춰져 있다 (Frustum.containsPoint 검증: 16:9/4:3/1:1 모두 64/64,
      // 반지름 230 띠 대비 15% 이상 여유). 이 값을 줄이면 소행성 띠가 화면 밖으로 잘릴 수 있다.
      camera={{ position: [0, 280, 495], fov: 55, near: 0.1, far: 5000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#05070d']} />
      <Starfield />
      {/* Bodies는 engine.step()의 유일한 호출자다. 이후 엔진 상태를 "읽기만" 하는 씬 요소
          (예: Task 12의 Trails)는 같은 프레임 안에서 갱신된 상태를 보도록 Bodies보다
          뒤에 마운트해야 한다. */}
      <Bodies />
      <Trails />
      <CameraRig />
      <SpawnController />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
