'use client';

import { useEffect, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';

interface Info {
  mass: number;
  radius: number;
  speed: number;
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
    </div>
  );
}
