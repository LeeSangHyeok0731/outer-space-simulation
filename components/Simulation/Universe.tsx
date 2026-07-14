'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import SpacetimeGrid from './SpacetimeGrid';
import CelestialBody from './CelestialBody';
import OrbitPath from './OrbitPath';

export type BodyType = 'star' | 'planet' | 'blackhole';

export interface BodyData {
  id: string;
  type: BodyType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mass: number;
  radius: number;
  color: string;
}

const G = 0.5;
const DENSITY_THRESHOLD = 200; 
const MASS_THRESHOLD = 4000;

export default function Universe() {
  const [bodies, setBodies] = useState<BodyData[]>([
    {
      id: 'sun',
      type: 'star',
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      mass: 80,
      radius: 2,
      color: '#ffcc00',
    },
    {
      id: 'earth',
      type: 'planet',
      position: new THREE.Vector3(30, 0, 0),
      velocity: new THREE.Vector3(0, 0, 1.2),
      mass: 1.2,
      radius: 0.6,
      color: '#2266ff',
    }
  ]);

  // 격자 설정 상태 (대폭 확장)
  const [gridSize, setGridSize] = useState(300);
  const [gridSegments, setGridSegments] = useState(80);
  const [showGrid, setShowGrid] = useState(true);
  const [timeScale, setTimeScale] = useState(1); // 배속 상태 추가

  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  const createPlanetData = useCallback((distMin = 20, distMax = 150) => {
    const distance = distMin + Math.random() * (distMax - distMin);
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    
    const suns = bodies.filter(b => b.type === 'star' || b.type === 'blackhole');
    // 다중 항성계 대응: 가장 가까운 거대 천체 기준 또는 질량 합산
    const sunMass = suns.reduce((acc, b) => acc + b.mass, 0) || 50;
    const speed = Math.sqrt((G * sunMass) / distance) * (0.8 + Math.random() * 0.4);
    
    const vx = -Math.sin(angle) * speed;
    const vz = Math.cos(angle) * speed;

    return {
      id: `planet-${Date.now()}-${Math.random()}`,
      type: 'planet' as BodyType,
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(vx, 0, vz),
      mass: 0.5 + Math.random() * 5,
      radius: 0.4 + Math.random() * 1.5,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };
  }, [bodies]);

  const addPlanet = useCallback(() => {
    setBodies(prev => [...prev, createPlanetData()]);
  }, [createPlanetData]);

  const addMultiplePlanets = useCallback((count: number) => {
    const newPlanets = Array.from({ length: count }).map(() => createPlanetData(30, 250));
    setBodies(prev => [...prev, ...newPlanets]);
  }, [createPlanetData]);

  const removeBody = (id: string) => {
    setBodies(prev => prev.filter(b => b.id !== id));
    setSelectedBodyId(null);
    setContextMenu(null);
  };

  const updateBody = (id: string, updates: Partial<BodyData>) => {
    setBodies(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const onRightClick = (e: ThreeEvent<PointerEvent>, id: string) => {
    setSelectedBodyId(id);
    setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-4 p-5 bg-zinc-900/80 backdrop-blur-lg rounded-2xl border border-white/10 text-white w-72 pointer-events-auto shadow-2xl overflow-y-auto max-h-[90vh]">
        <div>
          <h2 className="text-xl font-black tracking-tighter mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent italic">DEEP SPACE</h2>
          
          <div className="space-y-2">
            <button 
              onClick={addPlanet}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-blue-900/20 text-sm"
            >
              + Add Single Planet
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => addMultiplePlanets(5)}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold transition-all active:scale-95 text-xs"
              >
                + 5 Planets
              </button>
              <button 
                onClick={() => addMultiplePlanets(20)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-all active:scale-95 text-xs"
              >
                + 20 Planets
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-white/10 w-full" />

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-zinc-400">Environment</h3>
            <button 
              onClick={() => setShowGrid(!showGrid)}
              className={`text-[10px] px-2 py-1 rounded font-bold ${showGrid ? 'bg-green-600' : 'bg-zinc-700'}`}
            >
              GRID: {showGrid ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-mono uppercase">
                <span>Space Range</span>
                <span className="text-white">{gridSize} units</span>
              </div>
              <input 
                type="range" min="100" max="2000" step="50" 
                value={gridSize}
                onChange={(e) => setGridSize(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-mono uppercase">
                <span>Grid Resolution</span>
                <span className="text-white">{gridSegments}</span>
              </div>
              <input 
                type="range" min="20" max="300" step="10" 
                value={gridSegments}
                onChange={(e) => setGridSegments(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>
        </div>

        <div className="text-[10px] text-zinc-500 flex justify-between items-center bg-black/30 p-2 rounded-lg">
          <span>Active Bodies: <span className="text-white font-bold">{bodies.length}</span></span>
          <span className="opacity-50 animate-pulse">● LIVE</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && selectedBodyId && (
        <div 
          className="absolute z-20 p-4 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl text-white w-64 backdrop-blur-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 className="font-black text-[10px] uppercase tracking-widest text-zinc-500 italic">{bodies.find(b => b.id === selectedBodyId)?.type} Core</h3>
            <button onClick={() => setContextMenu(null)} className="text-zinc-600 hover:text-white transition-colors text-sm">✕</button>
          </div>
          
          <div className="space-y-4 mb-5">
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-mono">
                <span>MASSIVE INDEX</span>
                <span className="text-blue-400">{(bodies.find(b => b.id === selectedBodyId)?.mass || 0).toFixed(1)}</span>
              </div>
              <input 
                type="range" min="0.1" max="5000" step="1" 
                value={bodies.find(b => b.id === selectedBodyId)?.mass || 0}
                onChange={(e) => updateBody(selectedBodyId, { mass: parseFloat(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-mono">
                <span>EVENT RADIUS</span>
                <span className="text-purple-400">{(bodies.find(b => b.id === selectedBodyId)?.radius || 0).toFixed(1)}</span>
              </div>
              <input 
                type="range" min="0.1" max="100" step="0.5" 
                value={bodies.find(b => b.id === selectedBodyId)?.radius || 0}
                onChange={(e) => updateBody(selectedBodyId, { radius: parseFloat(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          <button 
            onClick={() => removeBody(selectedBodyId)}
            className="w-full py-2 bg-red-950/50 hover:bg-red-600 border border-red-900/50 rounded-xl font-bold transition-all text-[10px] text-red-400 hover:text-white"
          >
            COLLAPSE ENTITY
          </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 150, 200], fov: 45, far: 5000 }} onClick={() => setContextMenu(null)}>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 0, 0]} intensity={200} color="#ffcc00" />
        
        {/* 확장된 우주 배경 */}
        <Stars radius={1500} depth={500} count={20000} factor={6} saturation={0} fade speed={0.5} />
        
        <PhysicsUpdate bodies={bodies} setBodies={setBodies} gridSize={gridSize} />
        
        {showGrid && <SpacetimeGrid bodies={bodies} size={gridSize} segments={gridSegments} />}
        
        {bodies.map((body) => (
          <React.Fragment key={body.id}>
            <CelestialBody 
              {...body} 
              onPointerDown={(e) => {
                if (e.button === 2) onRightClick(e, body.id);
              }}
            />
            {body.type === 'planet' && <OrbitPath body={body} />}
          </React.Fragment>
        ))}

        {/* 확장된 카메라 컨트롤 */}
        <OrbitControls makeDefault maxDistance={3000} minDistance={5} />
      </Canvas>
    </div>
  );
}

function PhysicsUpdate({ 
  bodies, 
  setBodies, 
  gridSize 
}: { 
  bodies: BodyData[], 
  setBodies: React.Dispatch<React.SetStateAction<BodyData[]>>,
  gridSize: number
}) {
  const bodiesRef = useRef<BodyData[]>(bodies);
  bodiesRef.current = bodies;

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const currentBodies = bodiesRef.current;
    if (currentBodies.length === 0) return;

    const velocityChanges = currentBodies.map(() => new THREE.Vector3(0, 0, 0));
    const toRemove = new Set<string>();
    const toUpdate = new Map<string, Partial<BodyData>>();

    const bound = gridSize / 2 + 100; // 격자보다 약간 더 여유 있게 제거

    for (let i = 0; i < currentBodies.length; i++) {
      const b = currentBodies[i];
      
      if (Math.abs(b.position.x) > bound || Math.abs(b.position.z) > bound) {
        toRemove.add(b.id);
        continue;
      }

      if (b.type !== 'blackhole') {
        const density = b.mass / (b.radius || 0.1);
        if (density > DENSITY_THRESHOLD || b.mass > MASS_THRESHOLD) {
          toUpdate.set(b.id, { 
            type: 'blackhole', 
            color: '#000000', 
            radius: Math.max(0.5, b.mass / 150)
          });
        }
      }

      if (toRemove.has(b.id)) continue;

      for (let j = i + 1; j < currentBodies.length; j++) {
        if (toRemove.has(currentBodies[j].id)) continue;

        const p1 = currentBodies[i];
        const p2 = currentBodies[j];

        const diff = new THREE.Vector3().subVectors(p2.position, p1.position);
        const distSq = diff.lengthSq();
        const dist = Math.sqrt(distSq);

        if (dist < (p1.radius + p2.radius)) {
          let survivor = p1;
          let absorber = p2;

          const getPriority = (b: BodyData) => {
            if (b.type === 'blackhole') return 3;
            if (b.type === 'star') return 2;
            return 1;
          };

          const p1Prio = getPriority(p1);
          const p2Prio = getPriority(p2);

          if (p2Prio > p1Prio || (p2Prio === p1Prio && p2.mass > p1.mass)) {
            survivor = p2;
            absorber = p1;
          }

          const totalMass = survivor.mass + absorber.mass;
          const newVelocity = new THREE.Vector3()
            .addScaledVector(survivor.velocity, survivor.mass)
            .addScaledVector(absorber.velocity, absorber.mass)
            .divideScalar(totalMass);

          toUpdate.set(survivor.id, {
            mass: totalMass,
            velocity: newVelocity,
            radius: survivor.type === 'blackhole' 
              ? Math.max(0.5, totalMass / 150) 
              : Math.pow(Math.pow(survivor.radius, 3) + Math.pow(absorber.radius, 3), 1/3)
          });

          toRemove.add(absorber.id);
          continue; 
        }

        const forceMag = (G * p1.mass * p2.mass) / distSq;
        const force = diff.normalize().multiplyScalar(forceMag);

        velocityChanges[i].add(force.clone().divideScalar(p1.mass).multiplyScalar(dt));
        velocityChanges[j].add(force.multiplyScalar(-1).divideScalar(p2.mass).multiplyScalar(dt));
      }
    }

    if (toRemove.size > 0 || toUpdate.size > 0) {
      setBodies(prev => {
        const next = prev
          .filter(b => !toRemove.has(b.id))
          .map(b => toUpdate.has(b.id) ? { ...b, ...toUpdate.get(b.id) } : b);
        return next;
      });
    }

    currentBodies.forEach((b, i) => {
      if (!toRemove.has(b.id)) {
        b.velocity.add(velocityChanges[i]);
        b.position.add(b.velocity.clone().multiplyScalar(dt));
      }
    });
  });

  return null;
}
