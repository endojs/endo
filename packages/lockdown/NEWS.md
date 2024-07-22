User-visible changes to `@endo/lockdown`:

# Next release

- Changed `@endo/lockdown/commit-debug.js` so that it now sets
  the `lockdown` option `errorTaming: 'unsafe-debug'` instead of
  just `errorTaming: 'unsafe'`. This is a further loss of safety in
  exchange for a better development experience. For testing and debugging
  purposes during development, this is usually the right tradeoff.

  In particular,
  `errorTaming: 'unsafe'` endangered only confidentiality, whereas
  `errorTaming: 'unsafe-debug'` also endangers integrity, essentially by
  directly exposing the (non-standard and dangerous) v8 `Error`
  constructor API.

  In exchange, stack traces will more often have accurate line numbers into
  the sources of transpiled code, such as TypeScript sources. See
  [`errorTaming` Options](https://github.com/endojs/endo/blob/master/packages/ses/docs/lockdown.md#errortaming-options) for more on these tradeoffs.
