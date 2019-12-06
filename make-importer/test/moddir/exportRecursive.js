// eslint-disable-next-line import/no-mutable-exports,prefer-const
export let local1 = 23;
export { local1 as indirect } from './exportRecursive';
