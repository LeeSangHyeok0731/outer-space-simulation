'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BodyType, iscoRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

/**
 * 원반의 안쪽/바깥쪽 반지름 (ISCO 배수).
 *
 * 안쪽이 정확히 1.0 = ISCO인 것이 핵심이다. 실제 강착원반의 안쪽 가장자리도 ISCO다 —
 * 그 안쪽에는 안정 궤도가 없어 물질이 머물 수 없기 때문이다. 따라서 이 테두리는
 * 예쁜 장식인 동시에 "여기 넘어오면 삼켜진다"는 경계선 그 자체다.
 */
const INNER = 1.0;
const OUTER = 2.5;
const SEGMENTS = 64;

/** 동시에 비밍 원반을 그리는 블랙홀 수 상한. 초과분은 원반이 안 그려진다(흡수 물리는 그대로). */
const MAX_DISKS = 24;

/** 도플러 비밍 세기. 클수록 밝은 쪽/어두운 쪽 대비가 강하다(설계 문서 §5, 튜닝 대상). */
const BEAM_STRENGTH = 1.6;

// useFrame 안에서 할당하지 않기 위해 모듈 스코프에 재사용 객체를 둔다.
const camPos = new THREE.Vector3();
const sHat = new THREE.Vector3();

interface Disk {
  geometry: THREE.RingGeometry;
  /** 이 원반 전용 정점 색 버퍼. getAttribute 캐스팅 대신 직접 들고 갱신한다. */
  colorAttr: THREE.BufferAttribute;
}

export default function AccretionDisks() {
  const { engine } = useSimulation();
  const groupRef = useRef<THREE.Group>(null);

  // 원반 풀과, 모든 원반이 공유하는 공전 접선(v̂)을 선계산한다.
  const { disks, tangents, vertexCount } = useMemo(() => {
    // 접선은 모든 원반이 같은 평면·같은 회전 방향이라 정점마다 상수다. 템플릿에서 한 번만 뽑는다.
    const template = new THREE.RingGeometry(INNER, OUTER, SEGMENTS);
    const pos = template.getAttribute('position');
    const count = pos.count;
    const tan = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 로컬 정점 (x, y, 0)의 방위각. 원반은 -90°X 회전으로 황도면(XZ)에 눕으므로
      // 로컬 (x, y, 0) → 월드 (x, 0, -y). +Y축 공전의 접선은 v̂ = (-sinθ, 0, -cosθ).
      const theta = Math.atan2(pos.getY(i), pos.getX(i));
      tan[i * 3 + 0] = -Math.sin(theta);
      tan[i * 3 + 1] = 0;
      tan[i * 3 + 2] = -Math.cos(theta);
    }
    template.dispose();

    const arr: Disk[] = [];
    for (let d = 0; d < MAX_DISKS; d++) {
      const geometry = new THREE.RingGeometry(INNER, OUTER, SEGMENTS);
      const colorAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', colorAttr);
      arr.push({ geometry, colorAttr });
    }
    return { disks: arr, tangents: tan, vertexCount: count };
  }, []);

  // 언마운트 시 지오메트리 정리.
  useEffect(() => {
    return () => {
      for (const disk of disks) disk.geometry.dispose();
    };
  }, [disks]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    camera.getWorldPosition(camPos);
    const b = engine.bodies;

    let d = 0;
    for (let i = 0; i < b.count && d < MAX_DISKS; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      const mesh = group.children[d] as THREE.Mesh;
      const bx = b.posX[i];
      const by = b.posY[i];
      const bz = b.posZ[i];

      mesh.visible = true;
      mesh.position.set(bx, by, bz);
      // RingGeometry는 XY 평면에 눕는다. 황도면(XZ)으로 돌린다.
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.scale.setScalar(iscoRadius(b.mass[i]));

      // 시선 방향 ŝ: 블랙홀 중심 → 카메라. 원반 반지름 ≪ 카메라 거리라 원반당 하나로 근사.
      sHat.set(camPos.x - bx, camPos.y - by, camPos.z - bz).normalize();

      const { colorAttr } = disks[d];
      const col = colorAttr.array as Float32Array;
      for (let v = 0; v < vertexCount; v++) {
        // 도플러 비밍 계수 v̂·ŝ ∈ [-1, 1]. +는 다가옴(밝고 푸르게), -는 멀어짐(어둡고 붉게).
        const beam =
          tangents[v * 3] * sHat.x +
          tangents[v * 3 + 1] * sHat.y +
          tangents[v * 3 + 2] * sHat.z;
        const boost = Math.max(0.15, 1 + BEAM_STRENGTH * beam);
        col[v * 3 + 0] = 1.0 * boost;
        col[v * 3 + 1] = (0.55 + 0.35 * beam) * boost;
        col[v * 3 + 2] = (0.2 + 0.6 * Math.max(0, beam)) * boost;
      }
      colorAttr.needsUpdate = true;
      d++;
    }

    // 남는 풀 메시는 숨긴다.
    for (; d < MAX_DISKS; d++) {
      (group.children[d] as THREE.Mesh).visible = false;
    }
  });

  return (
    <group ref={groupRef}>
      {disks.map((disk, i) => (
        <mesh key={i} geometry={disk.geometry} frustumCulled={false} visible={false}>
          {/* 정점 색으로 도플러 비밍을 낸다. 가산 혼합 + 블룸으로 밝은 쪽이 빛난다.
              depthWrite를 끄지 않으면 원반이 뒤쪽 천체를 가린다. */}
          <meshBasicMaterial
            vertexColors
            side={THREE.DoubleSide}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
