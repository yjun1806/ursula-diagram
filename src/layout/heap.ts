/** A binary min-heap of numbers keyed by cost. Items of equal cost come out in no promised order. */
export class Heap {
  private readonly costs: number[] = [];
  private readonly items: number[] = [];

  get size(): number {
    return this.costs.length;
  }

  push(cost: number, item: number): void {
    let i = this.costs.length;
    this.costs.push(cost);
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.costs[parent] as number) <= cost) break;
      this.costs[i] = this.costs[parent] as number;
      this.items[i] = this.items[parent] as number;
      i = parent;
    }
    this.costs[i] = cost;
    this.items[i] = item;
  }

  /** The item of least cost, taken out. */
  pop(): { cost: number; item: number } {
    const top = { cost: this.costs[0] as number, item: this.items[0] as number };
    const cost = this.costs.pop() as number;
    const item = this.items.pop() as number;
    const n = this.costs.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= n) break;
      if (child + 1 < n && (this.costs[child + 1] as number) < (this.costs[child] as number)) child += 1;
      if ((this.costs[child] as number) >= cost) break;
      this.costs[i] = this.costs[child] as number;
      this.items[i] = this.items[child] as number;
      i = child;
    }
    this.costs[i] = cost;
    this.items[i] = item;
    return top;
  }
}
