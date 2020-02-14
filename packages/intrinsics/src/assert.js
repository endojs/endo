export function assert(condition, errorMessage) {
  if (!condition) {
    throw new TypeError(errorMessage);
  }
}
