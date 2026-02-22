---
'@endo/errors': minor
---

- Exports `assert.details` under its own name (i.e., `details`).

- `hideAndHardenFunction` - If a function `foo` is first frozen with `hideAndHardenFunction(foo)` rather than `freeze(foo)` or `harden(foo)`, then `foo.name` is changed from `'foo'` to `'__HIDE_foo'`. When `stackFiltering: 'concise'` or `stackFiltering: 'omit-frames'`, then (currently only on v8), the stack frames for that function are omitted from the stacks reported by our causal console.

- The new `Rejector` type supports the confirmFoo/reject pattern:

  ```js
  @import {FAIL, hideAndHardenFunction} from '@endo@errors';
  @import {Rejector} from '@endo/errors/rejector.js';

  const confirmFoo = (specimen, reject: Rejector) =>
    test(specimen) || reject && reject`explanation of what went wrong`;

  export const isFoo = specimen => confirmFoo(specimen, false);
  hideAndHardenFunction(isFoo);

  export const assertFoo = specimen => {
    confirmFoo(specimen, FAIL);
  };
  hideAndHardenFunction(assertFoo);
  ```

  Both `false` and `Fail` satisfy the `Rejector` type.
  We also deprecate the old checkFoo/assertChecker pattern from @endo/common.
  The exported `isFoo` and `assertFoo` behave the same as they had when then they were using the checkFoo/assertChecker pattern, but are now internally faster and clearer.
