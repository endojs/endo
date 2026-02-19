---
'@endo/patterns': minor
---

`@endo/patterns` now exports a new `getNamedMethodGuards(interfaceGuard)` that returns that interface guard's record of method guards. The motivation is to support interface inheritance expressed by patterns like

```js
const I2 = M.interface('I2', {
  ...getNamedMethodGuards(I1),
  doMore: M.call().returns(M.any()),
});
```

See `@endo/exo`'s `exo-wobbly-point.test.js` to see it in action together with an experiment in class inheritance.
