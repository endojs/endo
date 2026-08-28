/* eslint-disable @endo/no-assign-to-exported-let-var-or-function */
/* eslint-disable import/no-mutable-exports */
/* eslint-env node */
// ESM module that exports and then mutates its exports
export let namedLet = 'original';
// eslint-disable-next-line no-var
export var namedVar = 'original';
export const namedConst = { value: 'original' };

let defaultValue = 'original';
export default defaultValue;

setTimeout(() => {
  namedLet = 'mutated';
  namedVar = 'mutated';
  namedConst.value = 'mutated'; // can't reassign const, but can mutate its properties
  // Note: cannot reassign `default` binding from inside ESM
  // default was bound to the value at export time
  defaultValue = 'mutated'; // this changes the local variable but not the exported default
}, 50);
