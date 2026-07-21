import { describe, it, expect } from 'vitest';
import { SimulationEngine } from './sim/engine';
import { createStarterSystem } from './sim/scenes';
import { listSaves, saveToSlot, deleteSave, serializeToJson, parseAndValidate } from './saves';
import type { SerializedState } from './sim/engine';

/** node 테스트 환경엔 localStorage가 없으므로 최소 Storage를 주입한다. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function sampleState(): SerializedState {
  const engine = new SimulationEngine();
  createStarterSystem(engine);
  return engine.serialize();
}

describe('saveToSlot / listSaves', () => {
  it('저장 → 목록 → 로드 왕복이 같은 천체 수를 준다', () => {
    const s = fakeStorage();
    const state = sampleState();
    saveToSlot(s, '내 우주', state);

    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('내 우주');
    expect(slots[0].state.bodies).toHaveLength(state.bodies.length);
  });

  it('savedAt 내림차순으로 정렬한다', () => {
    const s = fakeStorage();
    const a = saveToSlot(s, 'A', sampleState());
    const b = saveToSlot(s, 'B', sampleState());
    const slots = listSaves(s);
    expect(slots.map((x) => x.id)).toContain(a.id);
    expect(slots.map((x) => x.id)).toContain(b.id);
    expect(slots[0].savedAt).toBeGreaterThanOrEqual(slots[1].savedAt);
  });

  it('deleteSave는 해당 슬롯만 제거한다', () => {
    const s = fakeStorage();
    const a = saveToSlot(s, 'A', sampleState());
    saveToSlot(s, 'B', sampleState());
    deleteSave(s, a.id);
    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('B');
  });

  it('storage 전체가 깨졌으면 빈 목록을 준다', () => {
    const s = fakeStorage();
    s.setItem('outer-space:saves', '{not json');
    expect(listSaves(s)).toEqual([]);
  });

  it('슬롯 하나가 썩어도 나머지는 보존한다', () => {
    const s = fakeStorage();
    saveToSlot(s, '정상', sampleState());
    const raw = JSON.parse(s.getItem('outer-space:saves')!);
    raw.push({ id: 'x', name: '썩음', savedAt: 1, state: { simTime: NaN, bodies: [] } });
    s.setItem('outer-space:saves', JSON.stringify(raw));
    const slots = listSaves(s);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('정상');
  });

  it('쓰기 예외(용량 초과 등)를 전파한다', () => {
    const throwing = fakeStorage();
    throwing.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    expect(() => saveToSlot(throwing, 'X', sampleState())).toThrow();
  });
});

describe('parseAndValidate / serializeToJson', () => {
  it('serialize → parse 왕복이 무손실이다', () => {
    const state = sampleState();
    const result = parseAndValidate(serializeToJson(state));
    expect('error' in result).toBe(false);
    expect((result as SerializedState).bodies).toHaveLength(state.bodies.length);
  });

  it('JSON 파싱 실패를 error로 준다', () => {
    expect(parseAndValidate('{not json')).toHaveProperty('error');
  });

  it('simTime이 수치가 아니면 거부한다', () => {
    expect(parseAndValidate('{"simTime":"x","bodies":[]}')).toHaveProperty('error');
  });

  it('bodies가 배열이 아니면 거부한다', () => {
    expect(parseAndValidate('{"simTime":0,"bodies":{}}')).toHaveProperty('error');
  });

  it('body 필드에 NaN(null)이 있으면 거부한다', () => {
    const text =
      '{"simTime":0,"bodies":[{"x":null,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":0,"color":[1,1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
  });

  it('알 수 없는 type이면 거부한다', () => {
    const text =
      '{"simTime":0,"bodies":[{"x":0,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":99,"color":[1,1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
  });

  it('color 형태가 틀리면 거부한다', () => {
    const text =
      '{"simTime":0,"bodies":[{"x":0,"y":0,"z":0,"vx":0,"vy":0,"vz":0,"mass":1,"radius":1,"type":0,"color":[1,1]}]}';
    expect(parseAndValidate(text)).toHaveProperty('error');
  });
});
