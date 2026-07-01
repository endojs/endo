/**
 * @deprecated Import `E` from `@endo/eventual-send` directly. `@endo/far` is a
 * plain re-exporter (endojs/endo-but-for-bots#543): importing a name through it
 * rather than from the package that originally exports it is discouraged, and
 * this re-export is slated for removal in a future major version.
 */
export { E } from '@endo/eventual-send';

/**
 * @deprecated Import `Far`, `getInterfaceOf`, and `passStyleOf` from
 * `@endo/pass-style` directly. `@endo/far` is a plain re-exporter
 * (endojs/endo-but-for-bots#543): importing these names through it rather than
 * from the package that originally exports them is discouraged, and this
 * re-export is slated for removal in a future major version.
 */
export { Far, getInterfaceOf, passStyleOf } from '@endo/pass-style';

// eslint-disable-next-line import/export
export * from './exports.js';
