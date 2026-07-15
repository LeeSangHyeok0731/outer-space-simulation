import { describe, expect, it } from 'vitest';
import { EventBuffer, EventKind } from './events';

describe('EventBuffer', () => {
  it('push하면 count가 늘고 필드가 저장된다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.EVAPORATION, 1, 2, 3, 100);
    expect(e.count).toBe(1);
    expect(e.kind[0]).toBe(EventKind.EVAPORATION);
    expect(e.x[0]).toBe(1);
    expect(e.y[0]).toBe(2);
    expect(e.z[0]).toBe(3);
    expect(e.payload[0]).toBe(100);
  });

  it('clear하면 count가 0이 된다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.MERGE, 0, 0, 0, 1);
    e.clear();
    expect(e.count).toBe(0);
  });

  it('용량을 넘으면 새 이벤트를 조용히 버린다 (시각효과일 뿐)', () => {
    const e = new EventBuffer(2);
    e.push(EventKind.MERGE, 0, 0, 0, 1);
    e.push(EventKind.MERGE, 0, 0, 0, 2);
    e.push(EventKind.MERGE, 0, 0, 0, 3); // 버려짐
    expect(e.count).toBe(2);
    expect(e.payload[0]).toBe(1);
    expect(e.payload[1]).toBe(2);
  });

  it('여러 종류를 섞어 담을 수 있다', () => {
    const e = new EventBuffer(4);
    e.push(EventKind.EVAPORATION, 0, 0, 0, 10);
    e.push(EventKind.MERGE, 5, 0, 0, 20);
    expect(e.kind[0]).toBe(EventKind.EVAPORATION);
    expect(e.kind[1]).toBe(EventKind.MERGE);
  });
});
