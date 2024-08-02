/** @import {TestRoutine} from '../types */

/** @type {TestRoutine} */
export const section = async (execa, testLine) => {
  // If a runlet returns a promise for some value, it will print that value before exiting gracefully.
  await testLine(execa`endo run runlet.js a b c`, {
    stdout: "Hello, World! [ 'a', 'b', 'c' ]\n42",
  });
};
