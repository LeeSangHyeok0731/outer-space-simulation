'use client';

import BodyCard from './BodyCard';
import ControlPanel from './ControlPanel';
import SpawnPanel from './SpawnPanel';
import StatsHud from './StatsHud';

export default function Overlay() {
  return (
    // 컨테이너는 클릭을 통과시킨다. 패널만 pointer-events-auto로 되돌린다.
    <div className="pointer-events-none absolute inset-0 z-10 p-4">
      <div className="absolute top-4 left-4">
        <StatsHud />
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-3">
        <SpawnPanel />
        <BodyCard />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <ControlPanel />
      </div>
    </div>
  );
}
