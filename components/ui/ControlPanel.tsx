'use client';

import { useSimulation } from '@/state/SimulationProvider';

const SPEEDS = [0.25, 1, 4, 16];

export default function ControlPanel() {
  const { paused, setPaused, timeScale, setTimeScale, resetScene } = useSimulation();

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-sky-400/20 bg-slate-950/70 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        className="rounded-full bg-sky-500/20 px-4 py-1.5 text-sm text-sky-100 transition hover:bg-sky-500/40"
      >
        {paused ? '재생' : '일시정지'}
      </button>

      <div className="mx-1 h-5 w-px bg-sky-400/20" />

      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setTimeScale(s)}
          className={`rounded-full px-3 py-1.5 font-mono text-xs transition ${
            timeScale === s
              ? 'bg-sky-400 text-slate-950'
              : 'text-sky-200/70 hover:bg-sky-500/20'
          }`}
        >
          {s}×
        </button>
      ))}

      <div className="mx-1 h-5 w-px bg-sky-400/20" />

      <button
        type="button"
        onClick={resetScene}
        className="rounded-full px-3 py-1.5 text-sm text-sky-200/70 transition hover:bg-rose-500/30 hover:text-rose-100"
      >
        리셋
      </button>
    </div>
  );
}
