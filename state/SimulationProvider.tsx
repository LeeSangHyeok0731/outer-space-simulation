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
import { scatterChaotic, scatterOrbital } from '@/lib/sim/scatter';
import { createStarterSystem } from '@/lib/sim/scenes';
import { BODY_PRESETS, type PresetKey } from '@/lib/sim/units';

export interface SimStats {
  count: number;
  simTime: number;
  fps: number;
}

export type ScatterMode = 'orbital' | 'chaotic';

/** 무리 소환으로 한 번에 뿌릴 수 있는 개수의 범위. */
export const SCATTER_MIN = 1;
export const SCATTER_MAX = 200;

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
  scatterCount: number;
  setScatterCount: (v: number) => void;
  /** 현재 프리셋 질량으로 scatterCount개를 한 번에 뿌린다. */
  scatter: (mode: ScatterMode) => void;
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
  const [scatterCount, setScatterCountState] = useState(50);

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

  const setScatterCount = useCallback((v: number) => {
    // 입력 칸은 빈 문자열이나 범위 밖의 값을 낼 수 있다. 여기서 한 번에 막는다.
    if (!Number.isFinite(v)) return;
    setScatterCountState(Math.min(Math.max(Math.round(v), SCATTER_MIN), SCATTER_MAX));
  }, []);

  const scatter = useCallback(
    (mode: ScatterMode) => {
      const opts = {
        count: scatterCount,
        mass: spawnMass,
        color: BODY_PRESETS[preset].color,
      };
      // 난수는 여기서 주입한다 — lib/sim은 Math.random을 직접 부르지 않는다.
      const run = mode === 'orbital' ? scatterOrbital : scatterChaotic;
      run(engine, opts, Math.random);
    },
    [engine, preset, scatterCount, spawnMass],
  );

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
      scatterCount,
      setScatterCount,
      scatter,
    }),
    [
      engine, paused, setPaused, timeScale, setTimeScale, spawnMass,
      preset, setPreset, showTrails, selectedId, stats, resetScene,
      scatterCount, setScatterCount, scatter,
    ],
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}
