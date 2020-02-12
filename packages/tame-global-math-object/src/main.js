export default function tameGlobalMathObject() {
  // Tame the %Math% intrinsic.

  // Use a concise method to obtain a named function without constructor.
  const MathStatic = {
    random() {
      throw TypeError('Math.random() is disabled');
    },
  };

  Math.random = MathStatic.random;
}
