const { defineProperties } = Object;

export default function tameGlobalMathObject() {
  const throwingRandom = {
    random() {
      throw Error('disabled');
    },
  }.random;

  defineProperties(Math, {
    random: {
      value: throwingRandom,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}
