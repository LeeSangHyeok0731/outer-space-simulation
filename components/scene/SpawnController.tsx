'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { predictTrajectory } from '@/lib/sim/predict';
import { BODY_PRESETS, radiusFromMass } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

/** 드래그 픽셀이 아니라 월드 거리에 비례한 초기 속도. 새총의 탄성 계수. */
const SLING_K = 0.06;
/** 이 픽셀 이하로 움직였으면 드래그가 아니라 클릭으로 본다. */
const CLICK_SLOP = 6;
const PREVIEW_POINTS = 400;

const ECLIPTIC = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export default function SpawnController() {
  const { gl, camera, raycaster } = useThree();
  const { engine, bodiesMeshRef, spawnMass, preset, setSelectedId } = useSimulation();

  const mode = useRef<'idle' | 'throw' | 'select'>('idle');
  const pressPx = useRef({ x: 0, y: 0 });
  const startWorld = useRef(new THREE.Vector3());
  const currentWorld = useRef(new THREE.Vector3());
  const pendingSelectId = useRef<number | null>(null);

  const ghostRef = useRef<THREE.Mesh>(null);
  const previewRef = useRef<THREE.Line>(null);
  const previewBuffer = useRef(new Float32Array(PREVIEW_POINTS * 3));
  // getAttribute('position')는 BufferAttribute | InterleavedBufferAttribute 유니언을 돌려주므로,
  // 직접 만든 BufferAttribute를 따로 쥐고 있으면 타입 단언 없이 .array/.needsUpdate에 접근할 수 있다.
  const previewAttr = useRef(new THREE.BufferAttribute(new Float32Array(PREVIEW_POINTS * 3), 3));

  // <line>은 JSX의 SVG line 타입과 충돌하므로 THREE.Line을 직접 만들어 <primitive>로 마운트한다.
  const previewLine = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
    });
    return new THREE.Line(geometry, material);
  }, []);

  // 렌더 중이 아니라 마운트 후(effect)에 attribute를 붙이고, 언마운트 시 GPU 리소스를 반납한다.
  useEffect(() => {
    previewLine.geometry.setAttribute('position', previewAttr.current);
    return () => {
      previewLine.geometry.dispose();
      const material = previewLine.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
    };
  }, [previewLine]);

  /** 화면 좌표 → 황도면(y=0) 위의 월드 좌표. 성공하면 true. 부수효과로 raycaster/ndc를 갱신한다. */
  const toPlane = useCallback(
    (e: PointerEvent, out: THREE.Vector3): boolean => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(ECLIPTIC, out) !== null;
    },
    [camera, gl, raycaster],
  );

  /** 포인터 아래에 천체가 있으면 그 id, 없으면 null. toPlane이 설정한 raycaster를 그대로 재사용한다. */
  const pickBody = useCallback((): number | null => {
    const mesh = bodiesMeshRef.current;
    if (!mesh) return null;
    const hits = raycaster.intersectObject(mesh, false);
    const first = hits[0];
    if (!first || first.instanceId === undefined) return null;
    return engine.bodies.id[first.instanceId];
  }, [bodiesMeshRef, engine, raycaster]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 왼쪽 버튼만
      if (!toPlane(e, hit)) return;

      pressPx.current = { x: e.clientX, y: e.clientY };
      // toPlane이 이미 이 이벤트의 NDC로 raycaster를 채워 두었으므로 같은 광선으로 픽킹한다.
      const picked = pickBody();

      if (picked !== null) {
        mode.current = 'select';
        pendingSelectId.current = picked;
      } else {
        mode.current = 'throw';
        pendingSelectId.current = null;
        startWorld.current.copy(hit);
        currentWorld.current.copy(hit);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (mode.current !== 'throw') return;
      if (toPlane(e, hit)) currentWorld.current.copy(hit);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || mode.current === 'idle') return;

      const dx = e.clientX - pressPx.current.x;
      const dy = e.clientY - pressPx.current.y;
      const isClick = Math.hypot(dx, dy) <= CLICK_SLOP;

      if (mode.current === 'select') {
        if (isClick) setSelectedId(pendingSelectId.current);
      } else if (!isClick) {
        // 새총: 끈 방향의 반대쪽으로 날아간다
        const vx = (startWorld.current.x - currentWorld.current.x) * SLING_K;
        const vz = (startWorld.current.z - currentWorld.current.z) * SLING_K;
        engine.spawn({
          position: [startWorld.current.x, 0, startWorld.current.z],
          velocity: [vx, 0, vz],
          mass: spawnMass,
          color: BODY_PRESETS[preset].color,
        });
      } else {
        setSelectedId(null);
      }

      mode.current = 'idle';
      pendingSelectId.current = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, engine, gl, pickBody, preset, raycaster, setSelectedId, spawnMass, toPlane]);

  useFrame(() => {
    const ghost = ghostRef.current;
    const line = previewRef.current;
    if (!ghost || !line) return;

    const dragging = mode.current === 'throw';
    ghost.visible = dragging;
    line.visible = dragging;
    if (!dragging) return;

    ghost.position.copy(startWorld.current);
    ghost.scale.setScalar(radiusFromMass(spawnMass));

    const vx = (startWorld.current.x - currentWorld.current.x) * SLING_K;
    const vz = (startWorld.current.z - currentWorld.current.z) * SLING_K;

    const n = predictTrajectory(
      engine.bodies,
      [startWorld.current.x, 0, startWorld.current.z],
      [vx, 0, vz],
      previewBuffer.current,
      1 / 60,
    );

    const attr = previewAttr.current;
    attr.array.set(previewBuffer.current);
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
  });

  return (
    <>
      <mesh ref={ghostRef} visible={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color="#7dd3fc" wireframe toneMapped={false} />
      </mesh>

      <primitive object={previewLine} ref={previewRef} visible={false} />
    </>
  );
}
