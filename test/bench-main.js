import { encodeBase64, decodeBase64 } from '../src/main.js';

const string = new Array(100)
  .fill(
    'there once a rich man from nottingham who tried to cross the river. what a dope, he tripped on a rope. now look at him shiver.',
  )
  .join(' ');
const data = encodeBase64(string);

{
  const start = Date.now();
  const limit = start + 1000;
  let operations = 0;
  for (let n = 1; Date.now() < limit; n *= 2) {
    for (let i = 0; i < n; i += 1) {
      encodeBase64(string);
    }
    operations += n;
  }
  const end = Date.now();
  const duration = end - start;
  console.log(
    operations / duration,
    'encodes per millisecond, for input of length',
    string.length,
  );
}

{
  const start = Date.now();
  const limit = start + 1000;
  let operations = 0;
  for (let n = 1; Date.now() < limit; n *= 2) {
    for (let i = 0; i < n; i += 1) {
      decodeBase64(data);
    }
    operations += n;
  }
  const end = Date.now();
  const duration = end - start;
  console.log(
    operations / duration,
    'decodes per millisecond, for input of length',
    data.length,
  );
}
