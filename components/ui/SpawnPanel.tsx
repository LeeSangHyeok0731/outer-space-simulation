'use client';

import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';
import { formatMass } from '@/lib/sim/realunits';
import { SCATTER_MAX, SCATTER_MIN, useSimulation } from '@/state/SimulationProvider';

const PRESET_KEYS: PresetKey[] = ['asteroid', 'planet', 'star'];

export default function SpawnPanel() {
  const {
    preset,
    setPreset,
    spawnMass,
    setSpawnMass,
    showTrails,
    setShowTrails,
    scatterCount,
    setScatterCount,
    scatter,
  } = useSimulation();

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
            <div>{BODY_PRESETS[k].label}</div>
            <div className="mt-0.5 font-mono text-[10px] leading-tight opacity-70">
              {formatMass(BODY_PRESETS[k].mass)}
            </div>
          </button>
        ))}
      </div>

      <label className="mb-1 block font-mono text-xs text-sky-200/70">
        질량 {formatMass(spawnMass)}
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

      <div className="mb-4 border-t border-sky-400/10 pt-3">
        <h2 className="mb-2 text-xs font-semibold tracking-widest text-sky-300/80 uppercase">
          무리 소환
        </h2>

        <label className="mb-2 flex items-center justify-between font-mono text-xs text-sky-200/70">
          개수
          <input
            type="number"
            min={SCATTER_MIN}
            max={SCATTER_MAX}
            value={scatterCount}
            onChange={(e) => setScatterCount(Number(e.target.value))}
            className="w-20 rounded border border-sky-400/20 bg-slate-900/80 px-2 py-1 text-right font-mono text-xs text-sky-100 focus:border-sky-400/60 focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => scatter('orbital')}
            className="rounded bg-sky-500/15 px-2 py-2 text-xs text-sky-100 transition hover:bg-sky-500/35"
          >
            고리 뿌리기
          </button>
          <button
            type="button"
            onClick={() => scatter('chaotic')}
            className="rounded bg-rose-500/15 px-2 py-2 text-xs text-rose-100 transition hover:bg-rose-500/35"
          >
            혼돈 뿌리기
          </button>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          위에서 고른 질량으로 뿌립니다. 고리는 가장 무거운 천체 주위를 공전하고,
          혼돈은 마구잡이로 흩어집니다.
        </p>
      </div>

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
