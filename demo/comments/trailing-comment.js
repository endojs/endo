export function buildRootObject() {
  const a = {
    a: 123,
    b: 456,
  };
  return harden({
    run() {
      return a;
    },
  });
}
// comment
