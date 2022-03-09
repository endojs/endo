import * as M1 from './add.wasm';
import * as M2 from './default.wasm';

export const result = [Object.keys(M1), Object.keys(M2)];

// throw Error(result.map(a => a.join()).join('|'));
