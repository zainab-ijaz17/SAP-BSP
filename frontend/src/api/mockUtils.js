// Small helpers shared by client-side mock implementations (gated behind
// REACT_APP_*_MOCK env flags) so mocked lookups feel like a real network call
// and return stable, repeatable data for a given key.

export function simulateDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Deterministic pseudo-random index in [0, max) derived from a string seed, so
// the same seed (e.g. a STPO number) always mocks the same data.
export function randomFromSeed(seed, max) {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}
