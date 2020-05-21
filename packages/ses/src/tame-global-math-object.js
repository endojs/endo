const { defineProperties } = Object;

export default function tameGlobalMathObject(mathTaming = 'safe') {
  if (mathTaming === 'unsafe') {
    return;
  }
  if (mathTaming !== 'safe') {
    throw new Error(`unrecognized mathTaming ${mathTaming}`);
  }

  // Tame the %Math% intrinsic.

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    random() {
      throw TypeError('Math.random() is disabled');
    },
  };

  defineProperties(Math, {
    random: { value: tamedMethods.random },
  });
}
