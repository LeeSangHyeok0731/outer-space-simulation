'use client';

import { useEffect, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';

interface Info {
  mass: number;
  radius: number;
  speed: number;
  pinned: boolean;
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
      setInfo({
        mass: b.mass[i],
        radius: b.radius[i],
        speed: Math.hypot(b.velX[i], b.velY[i], b.velZ[i]),
        pinned: b.pinned[i] === 1,
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
      </dl>

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

      {info.pinned && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/70">
          이 자리에 못박혀 있습니다. 중력은 그대로 내뿜습니다.
        </p>
      )}
    </div>
  );
}
