'use client';

import { useRef, useState } from 'react';
import { useSimulation } from '@/state/SimulationProvider';
import { SCENE_PRESETS } from '@/lib/sim/scenes';
import { serializeToJson } from '@/lib/saves';

function defaultSaveName(): string {
  return `우주 ${new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}`;
}

export default function ScenePanel() {
  const {
    engine,
    saves,
    refreshSaves,
    applyScenePreset,
    saveCurrent,
    loadSave,
    removeSave,
    importState,
  } = useSimulation();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) refreshSaves(); // 펼칠 때 최신 목록을 읽는다(이벤트 핸들러 — 규칙 안전)
  };

  const handleSave = () => {
    setError(null);
    try {
      saveCurrent(name.trim() || defaultSaveName());
      setName('');
    } catch {
      setError('저장에 실패했습니다 (저장 공간 부족).');
    }
  };

  const handleExport = () => {
    const json = serializeToJson(engine.serialize());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outer-space-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importState(String(reader.result));
      setError(result.ok ? null : result.error);
    };
    reader.onerror = () => setError('파일을 읽을 수 없습니다.');
    reader.readAsText(file);
  };

  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-sky-400/30 bg-slate-950/80 p-4 backdrop-blur">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between font-mono text-xs tracking-widest text-sky-300 uppercase"
      >
        <span>시나리오</span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* 프리셋 */}
          <div className="space-y-1">
            {SCENE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setError(null);
                  applyScenePreset(preset.key);
                }}
                className="w-full rounded bg-sky-500/15 px-2 py-1.5 text-left text-xs text-sky-100 transition hover:bg-sky-500/35"
              >
                <span className="block">{preset.label}</span>
                <span className="block text-[11px] text-slate-400">{preset.description}</span>
              </button>
            ))}
          </div>

          {/* 세이브 */}
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="세이브 이름"
                className="min-w-0 flex-1 rounded bg-slate-900/80 px-2 py-1 font-mono text-xs text-sky-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/40"
              >
                저장
              </button>
            </div>

            {saves.length === 0 ? (
              <p className="text-[11px] text-slate-500">저장된 우주 없음</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {saves.map((slot) => (
                  <li key={slot.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        loadSave(slot.id);
                      }}
                      className="min-w-0 flex-1 truncate rounded bg-slate-900/60 px-2 py-1 text-left text-xs text-sky-100 transition hover:bg-slate-800"
                      title={slot.name}
                    >
                      {slot.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSave(slot.id)}
                      className="rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-500/40"
                      aria-label={`${slot.name} 삭제`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 파일 */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleExport}
              className="flex-1 rounded bg-slate-800/80 px-2 py-1 text-xs text-sky-100 transition hover:bg-slate-700"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded bg-slate-800/80 px-2 py-1 text-xs text-sky-100 transition hover:bg-slate-700"
            >
              가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
