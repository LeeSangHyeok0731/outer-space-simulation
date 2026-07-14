import { describe, it, expect } from 'vitest';
import { BodyBuffer, type BodyInit } from './bodies';

const make = (over: Partial<BodyInit> = {}): BodyInit => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, radius: 1, ...over,
});

describe('BodyBuffer', () => {
  it('추가하면 count가 늘고 서로 다른 id를 준다', () => {
    const b = new BodyBuffer(4);
    const id1 = b.add(make({ x: 1 }));
    const id2 = b.add(make({ x: 2 }));
    expect(b.count).toBe(2);
    expect(id1).not.toBe(id2);
    expect(b.posX[0]).toBe(1);
    expect(b.posX[1]).toBe(2);
  });

  it('용량이 차면 -1을 반환하고 count는 그대로다', () => {
    const b = new BodyBuffer(2);
    b.add(make());
    b.add(make());
    expect(b.add(make())).toBe(-1);
    expect(b.count).toBe(2);
  });

  it('removeAt은 마지막 원소를 빈자리로 옮긴다 (swap-remove)', () => {
    const b = new BodyBuffer(4);
    b.add(make({ x: 10 }));
    b.add(make({ x: 20 }));
    const lastId = b.add(make({ x: 30 }));
    b.removeAt(0);
    expect(b.count).toBe(2);
    expect(b.posX[0]).toBe(30);
    expect(b.id[0]).toBe(lastId);
  });

  it('indexOfId는 swap-remove 후에도 올바른 위치를 찾는다', () => {
    const b = new BodyBuffer(4);
    const a = b.add(make({ x: 10 }));
    const c = b.add(make({ x: 30 }));
    b.removeById(a);
    expect(b.indexOfId(c)).toBe(0);
    expect(b.indexOfId(a)).toBe(-1);
  });

  it('clear는 count를 0으로 되돌린다', () => {
    const b = new BodyBuffer(4);
    b.add(make());
    b.clear();
    expect(b.count).toBe(0);
  });
});
