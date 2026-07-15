'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';
import { BodyType, schwarzschildRadius } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

// 동시에 왜곡에 넣는 블랙홀 상한. GLSL 배열 크기라 defines로 셰이더에 넘긴다.
const MAX_LENSES = 4;

// 변위 강도 배율. 겉보기 반지름²에 곱해 화면 거리로 나눈 값이 UV 변위가 된다.
// 시각 조정 대상(스펙 §7).
const STRENGTH_SCALE = 0.35;

// mainUv: 각 렌즈 중심으로 UV를 당겨 배경을 휘게 한다. 여러 렌즈는 변위를 누적한다.
// 화면비 보정(d.x *= uAspect)으로 원형 왜곡을 유지한다.
const fragmentShader = /* glsl */ `
uniform int uLensCount;
uniform vec2 uCenters[MAX_LENSES];
uniform float uRadii[MAX_LENSES];
uniform float uStrength[MAX_LENSES];
uniform float uAspect;

void mainUv(inout vec2 uv) {
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec2 d = uv - uCenters[i];
    d.x *= uAspect;
    float dist = length(d);
    if (dist < 1e-4) continue;
    // 가까울수록 강하게 당기되, 지평선 반지름 안에서는 발산하지 않도록 클램프.
    float pull = uStrength[i] / max(dist, uRadii[i]);
    vec2 dir = d / dist;   // 중심에서 바깥 방향(화면비 공간)
    dir.x /= uAspect;      // uv 공간으로 복원
    uv -= dir * pull;      // 샘플 좌표를 중심 쪽으로 당김
  }
}
`;

class LensingEffectImpl extends Effect {
  constructor() {
    super('GravitationalLensing', fragmentShader, {
      // 왜곡 결과가 원본을 대체해야 한다. 기본값 SCREEN은 원본과 합성돼 화면이 밝아진다.
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uLensCount', new THREE.Uniform(0)],
        [
          'uCenters',
          new THREE.Uniform(
            Array.from({ length: MAX_LENSES }, () => new THREE.Vector2()),
          ),
        ],
        ['uRadii', new THREE.Uniform(new Float32Array(MAX_LENSES))],
        ['uStrength', new THREE.Uniform(new Float32Array(MAX_LENSES))],
        ['uAspect', new THREE.Uniform(1)],
      ]),
      defines: new Map<string, string>([['MAX_LENSES', String(MAX_LENSES)]]),
    });
  }
}

// useFrame 안에서 할당하지 않기 위한 모듈 스코프 재사용 객체.
const proj = new THREE.Vector3();
const edge = new THREE.Vector3();
const camRight = new THREE.Vector3();
// 상위 MAX_LENSES개 선택용 스크래치(겉보기 반지름과 화면 좌표). 프레임마다 재사용.
const slotCx = new Float32Array(MAX_LENSES);
const slotCy = new Float32Array(MAX_LENSES);
const slotR = new Float32Array(MAX_LENSES);

/**
 * 중력 렌즈 후처리 이펙트. 매 프레임 화면상 겉보기 크기가 큰 블랙홀 최대 MAX_LENSES개를
 * 골라 화면 좌표·반지름·강도를 셰이더 uniform에 채운다. 셰이더가 프레임버퍼 전체를
 * 렌즈 중심으로 당겨 빛이 휘는 아인슈타인 링을 만든다. 엔진을 읽기만 하며 물리에
 * 되먹임하지 않는다(결정론 보존). Bloom 앞에 마운트한다.
 */
export default function GravitationalLensing() {
  const { engine } = useSimulation();
  const size = useThree((s) => s.size);
  const effect = useMemo(() => new LensingEffectImpl(), []);

  useFrame((state) => {
    const cam = state.camera;
    const b = engine.bodies;
    const aspect = size.width / size.height;

    // 카메라의 오른쪽 벡터(월드) — 겉보기 반지름 측정에 쓴다.
    camRight.setFromMatrixColumn(cam.matrixWorld, 0);

    // 각 블랙홀을 투영해, 겉보기 반지름 큰 순으로 상위 MAX_LENSES개를 슬롯에 유지한다.
    let n = 0; // 채워진 슬롯 수
    for (let i = 0; i < b.count; i++) {
      if (b.type[i] !== BodyType.BLACK_HOLE) continue;

      const rs = schwarzschildRadius(b.mass[i]);

      // 중심을 화면(UV [0,1])으로 투영.
      proj.set(b.posX[i], b.posY[i], b.posZ[i]).project(cam);
      const cx = proj.x * 0.5 + 0.5;
      const cy = proj.y * 0.5 + 0.5;
      // 카메라 뒤(z > 1)면 건너뛴다.
      if (proj.z > 1) continue;

      // 겉보기 반지름: 중심에서 카메라-오른쪽으로 rs만큼 떨어진 점을 투영해 UV 거리로.
      edge
        .set(
          b.posX[i] + camRight.x * rs,
          b.posY[i] + camRight.y * rs,
          b.posZ[i] + camRight.z * rs,
        )
        .project(cam);
      const ex = edge.x * 0.5 + 0.5;
      const ey = edge.y * 0.5 + 0.5;
      const appR = Math.hypot((ex - cx) * aspect, ey - cy);
      if (!Number.isFinite(appR) || appR <= 0) continue;

      // 상위 MAX_LENSES개 삽입(겉보기 반지름 큰 것 우선). 정렬 없이 슬롯 삽입.
      if (n < MAX_LENSES) {
        slotCx[n] = cx;
        slotCy[n] = cy;
        slotR[n] = appR;
        n++;
      } else {
        // 가장 작은 슬롯을 찾아 더 크면 교체.
        let minIdx = 0;
        for (let k = 1; k < MAX_LENSES; k++) {
          if (slotR[k] < slotR[minIdx]) minIdx = k;
        }
        if (appR > slotR[minIdx]) {
          slotCx[minIdx] = cx;
          slotCy[minIdx] = cy;
          slotR[minIdx] = appR;
        }
      }
    }

    const centers = effect.uniforms.get('uCenters')!.value as THREE.Vector2[];
    const radii = effect.uniforms.get('uRadii')!.value as Float32Array;
    const strength = effect.uniforms.get('uStrength')!.value as Float32Array;
    for (let k = 0; k < n; k++) {
      centers[k].set(slotCx[k], slotCy[k]);
      radii[k] = slotR[k];
      // 변위 강도 ∝ 겉보기 반지름²(즉 화면상 rs²) — 큰 블랙홀이 더 크게 휜다.
      strength[k] = STRENGTH_SCALE * slotR[k] * slotR[k];
    }
    effect.uniforms.get('uLensCount')!.value = n;
    effect.uniforms.get('uAspect')!.value = aspect;
  });

  return <primitive object={effect} dispose={null} />;
}
