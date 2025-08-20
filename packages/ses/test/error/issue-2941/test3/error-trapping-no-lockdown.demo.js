import '../../../../index.js';

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
