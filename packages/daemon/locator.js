// @ts-check

// Surface module: re-exports the public locator API from the source tree.
// Scope: locator-side functions only (parse, validate, format, inspect the
// `endo://` URL form). Identifier-side functions (`idFromLocator`,
// `externalizeId`, `internalizeLocator`) and test-only helpers (`LOCAL_NODE`
// sentinel, `formatLocatorForSharing`) are masked; they remain importable
// from `./src/locator.js` for in-package callers.

export {
  addressesFromLocator,
  assertValidLocator,
  formatLocator,
  parseLocator,
} from './src/locator.js';
