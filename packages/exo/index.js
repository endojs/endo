export { initEmpty } from './src/exo-makers.js';

// makeExo, defineExoClass, defineExoClassKit are re-exported from
// types-index so they get typed declarations that infer method types
// from InterfaceGuard (see types-index.d.ts).
// eslint-disable-next-line import/export
export * from './types-index.js';

// eslint-disable-next-line import/export -- ESLint not aware of type exports in types.d.ts
export * from './src/types.js';

export { GET_INTERFACE_GUARD } from './src/get-interface.js';
