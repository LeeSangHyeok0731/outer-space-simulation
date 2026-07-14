'use client';

import { useSimulation } from '@/state/SimulationProvider';

export default function StatsHud() {
  const { stats } = useSimulation();

  return (
    <div className="pointer-events-auto rounded-lg border border-sky-400/20 bg-slate-950/70 px-4 py-3 font-mono text-xs text-sky-100/90 backdrop-blur">
      <div className="flex gap-4">
        <span>
          천체 <span className="text-sky-300">{stats.count}</span>
        </span>
        <span>
          경과 <span className="text-sky-300">{stats.simTime.toFixed(1)}</span>s
        </span>
        <span>
          FPS <span className="text-sky-300">{stats.fps}</span>
        </span>
      </div>
    </div>
  );
}
