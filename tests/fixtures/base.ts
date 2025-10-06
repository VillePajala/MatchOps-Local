/**
 * Shared base utilities for test fixtures
 */

/**
 * Deterministic ID generator for fixtures
 */
export class TestIdGenerator {
  private static counters = new Map<string, number>();

  static generate(prefix: string): string {
    const current = this.counters.get(prefix) || 0;
    const next = current + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next.toString().padStart(3, '0')}`;
  }

  static reset(prefix?: string): void {
    if (prefix) {
      this.counters.delete(prefix);
    } else {
      this.counters.clear();
    }
  }
}

/**
 * Base fixture class providing common functionality
 */
export abstract class BaseFixture<T> {
  protected abstract getDefaults(): T;

  create(overrides: Partial<T> = {}): T {
    return { ...this.getDefaults(), ...overrides };
  }

  createMany(count: number, overrides: Partial<T> = {}): T[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({ ...overrides, ...(this.getVariation ? this.getVariation(i) : {}) } as Partial<T>)
    );
  }

  protected getVariation?(index: number): Partial<T>;
}

