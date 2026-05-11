/* global E, Far */
export const make = powers => {
  const counter = E(powers).request(
    '@host',
    'a counter, suitable for doubling',
    'my-counter',
  );
  return Far('Doubler', {
    async incr() {
      const n = await E(counter).incr();
      return n * 2;
    },
  });
};
