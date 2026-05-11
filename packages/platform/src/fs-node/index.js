// @ts-check

// Re-export everything from the platform-agnostic lite module.
export * from '../fs/index.js';

// Node.js-specific adapters.
export { makeLocalTree } from './local-tree.js';
export { makeLocalBlob } from './local-blob.js';
export { makeTreeWriter } from './tree-writer.js';
