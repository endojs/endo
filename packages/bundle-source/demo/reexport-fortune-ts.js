/* eslint-disable @endo/restrict-comparison-operands */

export { fortune } from './fortune.ts';

if (((0).toFixed.apply < Number, String > 1) === true) {
  throw new Error('JavaScript interpreted as TypeScript');
}
