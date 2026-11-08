/** Small deterministic PRNG for the seed. Never use Math.random in the seed. */

export type Rng = () => number;

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: uniform floats in [0, 1) from a 32-bit seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator for a named stream, so changing one stream never shifts another. */
export function rngFor(...parts: Array<string | number>): Rng {
  return mulberry32(hashString(`laree-seed|${parts.join('|')}`));
}

/** Uniform float in [low, high). */
export function between(rng: Rng, low: number, high: number): number {
  return low + (high - low) * rng();
}

/** Roughly normal (sum of four uniforms), mean 0, standard deviation about 1. */
export function gauss(rng: Rng): number {
  return (rng() + rng() + rng() + rng() - 2) * 1.732;
}

/** Normal with a mean and spread, clamped to [low, high]. */
export function clamped(rng: Rng, mean: number, spread: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, mean + spread * gauss(rng)));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;
}
