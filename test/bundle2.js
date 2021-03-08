/* global globalThis */
export function bundle2Add(a) {
  return a + 2;
}

export function bundle2Transform(a) {
  return `${a} is two foot wide`;
}

export function bundle2ReadGlobal() {
  return globalThis.sneakyChannel;
}
