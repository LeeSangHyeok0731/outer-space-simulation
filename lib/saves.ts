import { BodyType } from './sim/units';
import type { SerializedState, SerializedBody } from './sim/engine';

export interface SaveSlot {
  id: string;
  name: string;
  savedAt: number;
  state: SerializedState;
}

const STORAGE_KEY = 'outer-space:saves';
const VALID_TYPES = new Set<number>(Object.values(BodyType));

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidBody(b: unknown): b is SerializedBody {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  if (![o.x, o.y, o.z, o.vx, o.vy, o.vz, o.mass, o.radius].every(isFiniteNumber)) return false;
  if (typeof o.type !== 'number' || !VALID_TYPES.has(o.type)) return false;
  if (!Array.isArray(o.color) || o.color.length !== 3 || !o.color.every(isFiniteNumber)) return false;
  return true;
}

/** 신뢰 불가 입력을 SerializedState로 검증한다. 어긋나면 null. */
function validateSerializedState(v: unknown): SerializedState | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.simTime)) return null;
  if (!Array.isArray(o.bodies)) return null;
  if (!o.bodies.every(isValidBody)) return null;
  return v as SerializedState;
}

/** 파일/텍스트를 파싱·검증한다. 실패하면 사람이 읽을 error 문자열을 준다. */
export function parseAndValidate(text: string): SerializedState | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: '올바른 JSON 파일이 아닙니다.' };
  }
  const state = validateSerializedState(parsed);
  if (!state) return { error: '우주 데이터 형식이 아닙니다.' };
  return state;
}

export function serializeToJson(state: SerializedState): string {
  return JSON.stringify(state);
}

/** STORAGE_KEY에서 슬롯 배열을 읽는다. 전체가 깨졌으면 [], 개별 썩은 슬롯은 건너뛴다. */
function readSlots(storage: Storage): SaveSlot[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const slots: SaveSlot[] = [];
  for (const s of parsed) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !isFiniteNumber(o.savedAt)) continue;
    const state = validateSerializedState(o.state);
    if (!state) continue;
    slots.push({ id: o.id, name: o.name, savedAt: o.savedAt, state });
  }
  return slots;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function listSaves(storage: Storage): SaveSlot[] {
  return readSlots(storage).sort((a, b) => b.savedAt - a.savedAt);
}

/** 새 슬롯을 추가한다. storage.setItem 실패(용량/시크릿 모드)는 예외로 전파된다. */
export function saveToSlot(storage: Storage, name: string, state: SerializedState): SaveSlot {
  const slot: SaveSlot = { id: makeId(), name, savedAt: Date.now(), state };
  const slots = readSlots(storage);
  slots.push(slot);
  storage.setItem(STORAGE_KEY, JSON.stringify(slots));
  return slot;
}

export function deleteSave(storage: Storage, id: string): void {
  const slots = readSlots(storage).filter((s) => s.id !== id);
  storage.setItem(STORAGE_KEY, JSON.stringify(slots));
}
