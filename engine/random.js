// Cryptographically secure randomness with unbiased bounded integers
// (rejection sampling) and an injectable source for deterministic tests.
// Uses crypto.getRandomValues — never Math.random — for security-sensitive
// assignments (roles, secret words, room codes, tokens).

function defaultNextUint32() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * Create a random source.
 * @param {() => number} nextUint32 function returning a uniform uint32 (injectable for tests)
 */
export function createRng(nextUint32 = defaultNextUint32) {
  if (typeof nextUint32 !== 'function') {
    throw new TypeError('createRng expects a function returning a uint32');
  }

  /** Unbiased integer in [0, maxExclusive) via rejection sampling. */
  function int(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
      throw new RangeError(`int() expects an integer in (0, 2^32], got ${maxExclusive}`);
    }
    if (maxExclusive === 1) return 0;
    const range = 0x100000000;
    const limit = range - (range % maxExclusive);
    for (;;) {
      const v = nextUint32();
      if (v < limit) return v % maxExclusive;
    }
  }

  return {
    int,
    /** Uniform pick from a non-empty array. */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) throw new RangeError('pick() of empty array');
      return arr[int(arr.length)];
    },
    /** Uniform shuffle (Fisher–Yates). Returns a new array; input untouched. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** True/false with p probability (p=0.5 default). */
    bool(p = 0.5) {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return int(1 / p) === 0;
    },
  };
}

/** Generate `byteLength` random bytes as a lowercase hex string (crypto-secure). */
export function randomHex(byteLength, nextUint32 = defaultNextUint32) {
  let out = '';
  while (out.length < byteLength * 2) {
    out += (nextUint32() >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, byteLength * 2);
}

/** Human-friendly, unambiguous room code from a secure RNG. */
export function randomRoomCode(alphabet, length, nextUint32 = defaultNextUint32) {
  const rng = createRng(nextUint32);
  let code = '';
  for (let i = 0; i < length; i++) code += alphabet[rng.int(alphabet.length)];
  return code;
}
