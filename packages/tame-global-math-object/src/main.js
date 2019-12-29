const { defineProperties } = Object;

export default function tameGlobalMathObject() {
  defineProperties(Math, {
    random: {
      value: function random() {
        throw Error('disabled');
      },
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}
