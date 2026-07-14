'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSimulation } from '@/state/SimulationProvider';

const TRACKED = 32; // 궤적을 남길 천체 수
const POINTS = 120; // 천체당 궤적 점 개수
const SAMPLE_DT = 0.05; // 시뮬레이션 시간 기준 샘플 간격 (배속과 무관하게 일정한 길이)
const RETARGET_DT = 0.5; // 상위 32개를 다시 고르는 주기

const SEG_PER_BODY = POINTS - 1;
const VERTS = TRACKED * SEG_PER_BODY * 2;

export default function Trails() {
  const { engine, showTrails, selectedId } = useSimulation();
  const meshRef = useRef<THREE.LineSegments>(null);

  // 슬롯별 링버퍼. 매 프레임 할당하지 않는다.
  const slots = useRef({
    ids: new Int32Array(TRACKED), // 0 = 빈 슬롯
    history: new Float32Array(TRACKED * POINTS * 3),
    filled: new Int32Array(TRACKED), // 슬롯별 채워진 점 개수
    head: new Int32Array(TRACKED), // 링버퍼 쓰기 위치
  });

  const sampleTimer = useRef(0);
  const retargetTimer = useRef(RETARGET_DT); // 첫 프레임에 즉시 타깃 선정

  // geometry.getAttribute('position')는 BufferAttribute | InterleavedBufferAttribute 유니언을
  // 돌려주므로(@types/three@0.184.1), 직접 만든 BufferAttribute를 ref로 쥐고 그것만
  // mutate한다 (Task 11 SpawnController.tsx와 동일 패턴). geometry에는 effect에서 붙인다.
  const posAttr = useRef(new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));
  const colAttr = useRef(new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));

  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  useEffect(() => {
    geometry.setAttribute('position', posAttr.current);
    geometry.setAttribute('color', colAttr.current);
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.visible = showTrails;
    if (!showTrails) return;

    const b = engine.bodies;
    const s = slots.current;

    // 1. 주기적으로 추적 대상 재선정: 질량 상위 + 선택된 천체.
    //    이 블록은 초당 2회만 돈다. 전역 제약(useFrame 중 할당 금지)의 유일한 예외이며,
    //    할당 없는 top-K 선택으로 복잡하게 만들 만한 이득이 없어 의도적으로 허용한다.
    retargetTimer.current += delta;
    if (retargetTimer.current >= RETARGET_DT) {
      retargetTimer.current = 0;

      const order = Array.from({ length: b.count }, (_, i) => i).sort(
        (x, y) => b.mass[y] - b.mass[x],
      );
      const next = order.slice(0, TRACKED).map((i) => b.id[i]);

      if (selectedId !== null && !next.includes(selectedId) && b.indexOfId(selectedId) !== -1) {
        next[next.length - 1] = selectedId;
      }

      // 슬롯은 순위가 아니라 정체성으로 배정한다. 순위 위치로 배정하면 무거운 천체를
      // 하나 던질 때마다 나머지 전부가 한 칸씩 밀려 32개 궤적이 통째로 초기화된다.
      const targetIds = new Set(next);

      // 대상 집합에서 빠진 슬롯만 비운다 (병합돼 사라졌거나 상위 32위 밖으로 밀린 천체)
      for (let k = 0; k < TRACKED; k++) {
        if (s.ids[k] !== 0 && !targetIds.has(s.ids[k])) {
          s.ids[k] = 0;
          s.filled[k] = 0;
          s.head[k] = 0;
        }
      }

      // 이미 슬롯을 차지한 대상 id를 제외하고, 남은 대상 id를 빈 슬롯에 채운다
      const assigned = new Set<number>();
      for (let k = 0; k < TRACKED; k++) {
        if (s.ids[k] !== 0) assigned.add(s.ids[k]);
      }

      let slotCursor = 0;
      for (const id of next) {
        if (assigned.has(id)) continue;
        while (slotCursor < TRACKED && s.ids[slotCursor] !== 0) slotCursor++;
        if (slotCursor >= TRACKED) break;
        s.ids[slotCursor] = id;
        s.filled[slotCursor] = 0;
        s.head[slotCursor] = 0;
        slotCursor++;
      }
    }

    // 2. 시뮬레이션 시간 기준으로 샘플링 (배속을 올려도 궤적 길이가 일정하다)
    sampleTimer.current += delta * engine.timeScale;
    const shouldSample = !engine.paused && sampleTimer.current >= SAMPLE_DT;
    if (shouldSample) {
      sampleTimer.current = 0;

      for (let k = 0; k < TRACKED; k++) {
        const id = s.ids[k];
        if (id === 0) continue;
        const i = b.indexOfId(id);
        if (i === -1) {
          // 이 슬롯이 추적하던 천체가 병합 등으로 사라졌다. 다음 재선정까지 비워 둔다.
          s.ids[k] = 0;
          s.filled[k] = 0;
          continue;
        }

        const base = (k * POINTS + s.head[k]) * 3;
        s.history[base] = b.posX[i];
        s.history[base + 1] = b.posY[i];
        s.history[base + 2] = b.posZ[i];

        s.head[k] = (s.head[k] + 1) % POINTS;
        if (s.filled[k] < POINTS) s.filled[k]++;
      }
    }

    // 3. 링버퍼 → LineSegments 정점 (오래된 점일수록 어둡게)
    const pArr = posAttr.current.array;
    const cArr = colAttr.current.array;

    let v = 0;
    for (let k = 0; k < TRACKED; k++) {
      const id = s.ids[k];
      const n = s.filled[k];
      if (id === 0 || n < 2) continue;

      const i = b.indexOfId(id);
      const r = i === -1 ? 1 : b.colR[i];
      const g = i === -1 ? 1 : b.colG[i];
      const bl = i === -1 ? 1 : b.colB[i];

      // 가장 오래된 점부터 순서대로 잇는다.
      // 한 세그먼트 = 정점 2개. 배열 리터럴을 만들지 않고 두 정점을 직접 쓴다
      // (프레임당 수천 번 실행되는 루프이므로 여기서 할당하면 GC가 프레임을 잡아먹는다).
      const start = (s.head[k] - n + POINTS) % POINTS;
      for (let p = 0; p < n - 1; p++) {
        const a = (start + p) % POINTS;
        const c = (start + p + 1) % POINTS;
        const fade = p / (n - 1); // 0=오래됨(어두움), 1=최신(밝음)

        const srcA = (k * POINTS + a) * 3;
        pArr[v * 3] = s.history[srcA];
        pArr[v * 3 + 1] = s.history[srcA + 1];
        pArr[v * 3 + 2] = s.history[srcA + 2];
        cArr[v * 3] = r * fade;
        cArr[v * 3 + 1] = g * fade;
        cArr[v * 3 + 2] = bl * fade;
        v++;

        const srcC = (k * POINTS + c) * 3;
        pArr[v * 3] = s.history[srcC];
        pArr[v * 3 + 1] = s.history[srcC + 1];
        pArr[v * 3 + 2] = s.history[srcC + 2];
        cArr[v * 3] = r * fade;
        cArr[v * 3 + 1] = g * fade;
        cArr[v * 3 + 2] = bl * fade;
        v++;
      }
    }

    posAttr.current.needsUpdate = true;
    colAttr.current.needsUpdate = true;
    geometry.setDrawRange(0, v);
  });

  return (
    <lineSegments ref={meshRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} />
    </lineSegments>
  );
}
