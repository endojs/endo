#! /usr/bin/env endo-exec
console.log('Hello, Endo world!');
try {
  // @ts-expect-error TS2339
  Object.prototype.monkeyPatch = 'monkey';
  console.log('OOPS!  Monkey patch succeeded');
} catch (e) {
  console.log('Successful denial:', e);
}
