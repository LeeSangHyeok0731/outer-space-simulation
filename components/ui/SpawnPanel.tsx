'use client';

import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';
import { useSimulation } from '@/state/SimulationProvider';

const PRESET_KEYS: PresetKey[] = ['asteroid', 'planet', 'star'];

export default function SpawnPanel() {
  const { preset, setPreset, spawnMass, setSpawnMass, showTrails, setShowTrails } =
    useSimulation();

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/20 bg-slate-950/70 p-4 backdrop-blur">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-sky-300/80 uppercase">
        던질 천체
      </h2>

      <div className="mb-4 grid grid-cols-3 gap-1">
        {PRESET_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={`rounded px-2 py-2 text-xs transition ${
              preset === k
                ? 'bg-sky-400 text-slate-950'
                : 'bg-sky-500/10 text-sky-200/70 hover:bg-sky-500/25'
            }`}
          >
            {BODY_PRESETS[k].label}
          </button>
        ))}
      </div>

      <label className="mb-1 block font-mono text-xs text-sky-200/70">
        질량 {spawnMass.toFixed(1)}
      </label>
      <input
        type="range"
        min={0.1}
        max={5000}
        step={0.1}
        value={spawnMass}
        onChange={(e) => setSpawnMass(Number(e.target.value))}
        className="mb-4 w-full accent-sky-400"
      />

      <label className="flex cursor-pointer items-center gap-2 text-xs text-sky-200/70">
        <input
          type="checkbox"
          checked={showTrails}
          onChange={(e) => setShowTrails(e.target.checked)}
          className="accent-sky-400"
        />
        궤적 표시
      </label>

      <p className="mt-4 border-t border-sky-400/10 pt-3 text-[11px] leading-relaxed text-slate-400">
        빈 공간을 <b className="text-sky-300">왼쪽 드래그</b>해서 던지고,
        <br />
        <b className="text-sky-300">오른쪽 드래그</b>로 카메라를 돌립니다.
      </p>
    </div>
  );
}
