/* eslint-disable @endo/restrict-comparison-operands */

export { meaning } from './meaning.js';

if (((0).toFixed.apply < Number, String > 1) === true) {
  throw new Error('JavaScript interpreted as TypeScript');
}
