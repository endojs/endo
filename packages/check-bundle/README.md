# check-bundle

`checkBundle` verifies the integrity of a bundle, inspects all of its internal hashes and its one external hash.
`checkBundle` verifies the internal consistency, completeness, coherence, and conciseness (no extra files) of the bundle.
The function returns a rejected promise if the bundle fails the check.

```js
const bundle = await bundleSource('path/to/bundle.js');
// 'bundle' is JSON-serializable
await checkBundle(bundle);
```

This must be run in an Endo environment. To run on Node.js, import `@endo/init` before importing `@endo/import-bundle`.
