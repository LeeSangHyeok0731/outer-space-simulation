import SpaceCanvas from '@/components/scene/SpaceCanvas';
import Overlay from '@/components/ui/Overlay';
import { SimulationProvider } from '@/state/SimulationProvider';

export default function Home() {
  return (
    <SimulationProvider>
      <main className="relative h-dvh w-dvw overflow-hidden">
        <SpaceCanvas />
        <Overlay />
      </main>
    </SimulationProvider>
  );
}
