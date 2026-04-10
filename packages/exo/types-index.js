// Re-export makeExo and defineExoClass so they get typed declarations
// from types-index.d.ts that infer method types from InterfaceGuard.
export {
  makeExo,
  defineExoClass,
  defineExoClassKit,
} from './src/exo-makers.js';
