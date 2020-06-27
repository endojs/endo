const { create, getOwnPropertyDescriptors } = Object;

export default function tameGlobalMathObject(mathTaming = 'safe') {
  if (mathTaming !== 'safe' && mathTaming !== 'unsafe') {
    throw new Error(`unrecognized mathTaming ${mathTaming}`);
  }
  const originalMath = Math;

  // Tame the %Math% intrinsic.

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods = {
    random() {
      throw TypeError('Math.random() is disabled');
    },
  };

  const sharedMath = create(Object.prototype, {
    ...getOwnPropertyDescriptors(originalMath),
    random: {
      value: tamedMethods.random,
      writable: true,
      enumerable: false,
      configurable: true,
    },
  });

  return {
    start: {
      Math: {
        value: mathTaming === 'unsafe' ? originalMath : sharedMath,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
    shared: {
      Math: {
        value: sharedMath,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    },
  };
}
