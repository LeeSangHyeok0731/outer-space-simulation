'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type * as THREE from 'three';
import { SimulationEngine } from '@/lib/sim/engine';
import { createStarterSystem } from '@/lib/sim/scenes';
import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';

export interface SimStats {
  count: number;
  simTime: number;
  fps: number;
}

export interface SimulationContextValue {
  engine: SimulationEngine;
  bodiesMeshRef: RefObject<THREE.InstancedMesh | null>;
  paused: boolean;
  setPaused: (v: boolean) => void;
  timeScale: number;
  setTimeScale: (v: number) => void;
  spawnMass: number;
  setSpawnMass: (v: number) => void;
  preset: PresetKey;
  setPreset: (v: PresetKey) => void;
  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  selectedId: number | null;
  setSelectedId: (v: number | null) => void;
  stats: SimStats;
  setStats: (s: SimStats) => void;
  resetScene: () => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation은 SimulationProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  // 엔진은 단 한 번만 만들어지고 이후 identity가 바뀌지 않는다.
  const [engine] = useState(() => new SimulationEngine());
  const bodiesMeshRef = useRef<THREE.InstancedMesh | null>(null);

  const [paused, setPausedState] = useState(false);
  const [timeScale, setTimeScaleState] = useState(1);
  const [preset, setPresetState] = useState<PresetKey>('planet');
  const [spawnMass, setSpawnMass] = useState(BODY_PRESETS.planet.mass);
  const [showTrails, setShowTrails] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stats, setStats] = useState<SimStats>({ count: 0, simTime: 0, fps: 0 });

  useEffect(() => {
    createStarterSystem(engine);
  }, [engine]);

  // UI → 엔진은 명령형 호출로만. 엔진은 React를 다시 그리게 만들지 않는다.
  const setPaused = useCallback(
    (v: boolean) => {
      // eslint-disable-next-line react-hooks/immutability
      engine.paused = v;
      setPausedState(v);
    },
    [engine],
  );

  const setTimeScale = useCallback(
    (v: number) => {
      // eslint-disable-next-line react-hooks/immutability
      engine.timeScale = v;
      setTimeScaleState(v);
    },
    [engine],
  );

  const setPreset = useCallback((v: PresetKey) => {
    setPresetState(v);
    setSpawnMass(BODY_PRESETS[v].mass);
  }, []);

  const resetScene = useCallback(() => {
    createStarterSystem(engine);
    setSelectedId(null);
  }, [engine]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      engine,
      bodiesMeshRef,
      paused,
      setPaused,
      timeScale,
      setTimeScale,
      spawnMass,
      setSpawnMass,
      preset,
      setPreset,
      showTrails,
      setShowTrails,
      selectedId,
      setSelectedId,
      stats,
      setStats,
      resetScene,
    }),
    [
      engine, paused, setPaused, timeScale, setTimeScale, spawnMass,
      preset, setPreset, showTrails, selectedId, stats, resetScene,
    ],
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}
