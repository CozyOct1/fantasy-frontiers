/** Mulberry32 deterministic RNG. Seed/state are unsigned 32-bit integers. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new RangeError("Seed must be a safe integer");
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat(): number { return this.nextUint32() / 0x1_0000_0000; }

  int(minInclusive: number, maxInclusive: number): number {
    if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxInclusive) || maxInclusive < minInclusive) {
      throw new RangeError("Expected a valid inclusive integer range");
    }
    const span = maxInclusive - minInclusive + 1;
    if (span > 0x1_0000_0000) throw new RangeError("Integer range is too large");
    const limit = Math.floor(0x1_0000_0000 / span) * span;
    let sample: number;
    do { sample = this.nextUint32(); } while (sample >= limit);
    return minInclusive + (sample % span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot pick from an empty collection");
    return items[this.int(0, items.length - 1)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}
