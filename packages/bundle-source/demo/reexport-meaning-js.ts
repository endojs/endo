export { meaning } from './meaning.js';

if ((0).toFixed.apply<Number, String>(1) === false) {
  throw new Error('TypeScript interpreted as JavaScript');
}
