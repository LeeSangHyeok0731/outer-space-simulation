'use client';

import { useEffect, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';
import {
  BodyType,
  COLLAPSE_MASS,
  HAWKING_K,
  iscoRadius,
  PHOTON_SPHERE_FACTOR,
  schwarzschildRadius,
  timeDilationAt,
} from '@/lib/sim/units';

interface Info {
  mass: number;
  radius: number;
  speed: number;
  pinned: boolean;
  blackHole: boolean;
  dilation: number | null;
}

/**
 * 일반 천체 카드에 시간 지연 줄을 띄우는 임계. f가 이 값 미만(=1% 넘게 느려질 때)일 때만
 * 표시한다. 멀어서 밍밍한 "0.998×"로 카드를 어지럽히지 않는다.
 */
const TIME_DILATION_NOTICEABLE = 0.99;

/**
 * 호킹 증발까지 남은 시뮬레이션 시간. dM/dt = -K/M² 를 적분하면 t = M³ / (3K).
 * 질량이 조금만 커져도 어마어마해지므로 사람이 읽을 수 있는 단위로 접는다.
 */
function formatEvaporation(mass: number): string {
  const seconds = (mass * mass * mass) / (3 * HAWKING_K);
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}분`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}시간`;
  if (seconds < 86400 * 365) return `${(seconds / 86400).toFixed(1)}일`;
  const years = seconds / (86400 * 365);
  if (years > 1e6) return '사실상 영원';
  return `${years.toFixed(0)}년`;
}

export default function BodyCard() {
  const { engine, selectedId, setSelectedId } = useSimulation();
  const [info, setInfo] = useState<Info | null>(null);

  // 선택된 천체의 수치는 10Hz로만 읽는다. 매 프레임 리렌더할 이유가 없다.
  // selectedId가 null일 때는 setState를 직접 호출하지 않는다 — 아래 렌더 가드
  // (`selectedId === null`)가 이미 이 경우를 단락 평가로 처리하며, 여기서
  // setInfo(null)을 동기 호출하면 React Compiler의 set-state-in-effect 규칙에 걸린다.
  useEffect(() => {
    if (selectedId === null) return;

    const tick = () => {
      const b = engine.bodies;
      const i = b.indexOfId(selectedId);
      if (i === -1) {
        setSelectedId(null); // 병합되어 사라졌다
        return;
      }
      // 일반 천체가 블랙홀 근처에서 겪는 시간 지연. 가장 강한 지연(최소 f)을 주는
      // 블랙홀을 찾아, 눈에 띌 때(f < 임계)만 값을 둔다. 블랙홀 자신은 카드에서
      // 상수 기준 값을 따로 보여주므로 여기선 null이다.
      let dilation: number | null = null;
      if (b.type[i] !== BodyType.BLACK_HOLE) {
        let minF = 1;
        for (let k = 0; k < b.count; k++) {
          if (b.type[k] !== BodyType.BLACK_HOLE) continue;
          const dx = b.posX[i] - b.posX[k];
          const dy = b.posY[i] - b.posY[k];
          const dz = b.posZ[i] - b.posZ[k];
          const r = Math.hypot(dx, dy, dz);
          const f = timeDilationAt(schwarzschildRadius(b.mass[k]), r);
          if (f < minF) minF = f;
        }
        if (minF < TIME_DILATION_NOTICEABLE) dilation = minF;
      }

      setInfo({
        mass: b.mass[i],
        radius: b.radius[i],
        speed: Math.hypot(b.velX[i], b.velY[i], b.velZ[i]),
        pinned: b.pinned[i] === 1,
        blackHole: b.type[i] === BodyType.BLACK_HOLE,
        dilation,
      });
    };

    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [engine, selectedId, setSelectedId]);

  if (selectedId === null || !info) return null;

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/30 bg-slate-950/80 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-widest text-sky-300 uppercase">
          #{selectedId}
        </h2>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-xs text-slate-400 transition hover:text-sky-200"
        >
          닫기
        </button>
      </div>

      <dl className="space-y-1 font-mono text-xs text-sky-100/80">
        <div className="flex justify-between">
          <dt className="text-slate-400">질량</dt>
          <dd>{info.mass.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">반지름</dt>
          <dd>{info.radius.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">속력</dt>
          <dd>{info.speed.toFixed(2)}</dd>
        </div>
        {info.blackHole && (
          <>
            <div className="flex justify-between">
              <dt className="text-slate-400">사건의 지평선</dt>
              <dd>{schwarzschildRadius(info.mass).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-amber-300/70">흡수 반경 (ISCO)</dt>
              <dd className="text-amber-200">{iscoRadius(info.mass).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">증발까지</dt>
              <dd>{formatEvaporation(info.mass)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">시간 지연</dt>
              <dd className="text-right">
                광자 구{' '}
                {timeDilationAt(
                  schwarzschildRadius(info.mass),
                  PHOTON_SPHERE_FACTOR * schwarzschildRadius(info.mass),
                ).toFixed(2)}
                × · ISCO{' '}
                {timeDilationAt(schwarzschildRadius(info.mass), iscoRadius(info.mass)).toFixed(2)}×
              </dd>
            </div>
          </>
        )}
        {!info.blackHole && info.dilation !== null && (
          <div className="flex justify-between">
            <dt className="text-violet-300/70">시간 지연</dt>
            <dd className="text-violet-200">{info.dilation.toFixed(2)}×</dd>
          </div>
        )}
      </dl>

      <label className="mt-3 mb-1 block font-mono text-xs text-sky-200/70">
        질량 {info.mass.toFixed(1)}
        {!info.blackHole && info.mass >= COLLAPSE_MASS * 0.9 && (
          <span className="ml-2 text-amber-300">붕괴 임박</span>
        )}
      </label>
      <input
        type="range"
        min={0.1}
        max={10000}
        step={0.1}
        value={info.mass}
        onChange={(e) => {
          const m = Number(e.target.value);
          engine.setMass(selectedId, m);
          setInfo({ ...info, mass: m }); // 100ms 폴링을 기다리지 않고 즉시 반영한다
        }}
        className="mb-2 w-full accent-sky-400"
      />

      <button
        type="button"
        onClick={() => {
          engine.setPinned(selectedId, !info.pinned);
          setInfo({ ...info, pinned: !info.pinned }); // 100ms 폴링을 기다리지 않고 즉시 반영한다
        }}
        className={`mt-3 w-full rounded px-2 py-2 text-xs transition ${
          info.pinned
            ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
            : 'bg-sky-500/15 text-sky-100 hover:bg-sky-500/35'
        }`}
      >
        {info.pinned ? '위치 고정 해제' : '위치 고정'}
      </button>

      {!info.blackHole && (
        <button
          type="button"
          onClick={() => engine.collapseToBlackHole(selectedId)}
          className="mt-2 w-full rounded bg-violet-500/20 px-2 py-2 text-xs text-violet-100 transition hover:bg-violet-500/40"
        >
          블랙홀화
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          engine.remove(selectedId);
          setSelectedId(null);
        }}
        className="mt-2 w-full rounded bg-rose-500/15 px-2 py-2 text-xs text-rose-100 transition hover:bg-rose-500/40"
      >
        삭제
      </button>

      {info.pinned && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/70">
          이 자리에 못박혀 있습니다. 중력은 그대로 내뿜습니다.
        </p>
      )}

      {info.blackHole && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/70">
          원반 안쪽 테두리가 흡수 반경입니다. 그 안으로 들어온 것은
          궤도 속도와 무관하게 삼켜집니다.
        </p>
      )}
    </div>
  );
}
