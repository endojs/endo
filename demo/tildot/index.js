import { foo } from './file2.js';

const arg2 = foo({}, 'inhibit treeshaking');
export function blah(arg1) {
  let p = bob~.foo(arg1, arg2);
  return p;
}
