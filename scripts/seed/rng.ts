/**
 * Deterministic RNG primitives bound to a single seed. seedrandom-backed
 * so the same seed yields identical output across runs (Iron Rule:
 * synthesis must be reproducible — pinned in tests via deep-equal).
 *
 * Box-Muller `nextNormal` reuses the underlying [0,1) stream so the
 * resulting normal draws are also deterministic.
 */
import seedrandom from "seedrandom";

export interface Rng {
  nextBool: (prob: number) => boolean;
  nextChoice: <T>(arr: readonly T[]) => T;
  nextFloat: () => number;
  nextInt: (min: number, max: number) => number;
  nextNormal: (mean: number, stddev: number) => number;
}

export const makeRng = (seed: string): Rng => {
  const inner = seedrandom(seed);

  const nextFloat = (): number => inner();

  const nextInt = (min: number, max: number): number => {
    if (max < min) {
      throw new Error(`makeRng: nextInt(${min}, ${max}) — max < min`);
    }
    return Math.floor(nextFloat() * (max - min + 1)) + min;
  };

  const nextChoice = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) {
      throw new Error("makeRng: nextChoice on empty array");
    }
    const idx = Math.floor(nextFloat() * arr.length);
    return arr[idx] as T;
  };

  const nextBool = (prob: number): boolean => nextFloat() < prob;

  const nextNormal = (mean: number, stddev: number): number => {
    let u = 0;
    let v = 0;
    while (u === 0) {
      u = nextFloat();
    }
    while (v === 0) {
      v = nextFloat();
    }
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stddev;
  };

  return { nextFloat, nextInt, nextChoice, nextBool, nextNormal };
};
