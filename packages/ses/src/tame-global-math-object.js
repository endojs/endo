const { defineProperties } = Object;

export default function tameGlobalMathObject(noTameMath = false) {
  if (noTameMath) {
    return;
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
