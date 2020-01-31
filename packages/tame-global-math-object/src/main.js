const { defineProperties, getOwnPropertyDescriptors } = Object;

export default function tameGlobalMathObject() {
  const safeMathDescs = getOwnPropertyDescriptors({
    random() {
      throw Error('disabled');
    },
  });

  defineProperties(Math, {
    random: {
      value: safeMathDescs.random.value,
      enumerable: false,
      configurable: true,
      writable: true,
    },
  });
}
