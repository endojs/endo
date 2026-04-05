// eslint-disable-next-line import/export
export * from './src/external.types.js';

export { ModuleSource } from './src/module-source.js';
export { CjsModuleSource } from './src/cjs-module-source.js';
export {
  createModuleSourcePasses,
  createCjsModuleSourcePasses,
} from './src/visitor-passes.js';
