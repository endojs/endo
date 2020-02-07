export default function tameGlobalMathObject() {
  // Tame the %Math% intrinsic.
  const { random } = {
    random() {
      throw Error('disabled');
    },
  };

  Math.random = random;
}
