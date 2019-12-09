/* global insist */
// Adapted from table 43
/* eslint-disable prefer-const, import/no-duplicates, import/no-mutable-exports, import/no-named-as-default */
import v from './mod1';
import * as ns from './mod1';
import { x } from './mod2';
import { x as w } from './mod2';
import './mod3';

insist(v === ns.default, `mod1 imports match`);
insist(v === 'v', `mod1 is v`);
insist(ns.v2 === 'v2', `mod1 ns does not have v2`);
insist(x === w, `reimport does not match`);
insist(x === 'xChanged', `mutable export not changed`);
export let mu = 88;
mu += 1; // live because assigned to
let lo = 22;
lo += 1; // live because assigned to
export { lo as ex };
export { lo as ex2 };

// Adapted from table 45
export let co = 77;
export default 42;
const xx = 33;
export { xx };

export { w as vv }; // exports the w we imported. Therefore assumed live.
// eslint-disable-next-line import/export
export { f } from './foo';
export { g as h } from './foo';
// eslint-disable-next-line import/export
export * from './foo';
/* eslint-enable prefer-const, import/no-duplicates, import/no-mutable-exports, import/no-named-as-default */
