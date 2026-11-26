import { describe, expect, it } from 'vitest';
import { Heap } from '../src/layout/heap.ts';

describe('Heap', () => {
  it('gives the items back cheapest first, however they were pushed and popped', () => {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const heap = new Heap();
    const held: number[] = [];
    for (let step = 0; step < 5000; step++) {
      if (held.length === 0 || random() < 0.6) {
        const cost = Math.floor(random() * 50);
        heap.push(cost, step);
        held.push(cost);
      } else {
        const least = Math.min(...held);
        const { cost } = heap.pop();
        expect(cost).toBe(least);
        held.splice(held.indexOf(least), 1);
      }
      expect(heap.size).toBe(held.length);
    }
  });

  it('keeps each item with its cost', () => {
    const heap = new Heap();
    for (const [cost, item] of [[3, 30], [1, 10], [2, 20]] as const) heap.push(cost, item);
    expect([heap.pop(), heap.pop(), heap.pop()]).toEqual([{ cost: 1, item: 10 }, { cost: 2, item: 20 }, { cost: 3, item: 30 }]);
  });
});
