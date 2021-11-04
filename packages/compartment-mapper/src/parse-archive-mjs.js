// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';
import { join } from './node-module-specifier.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseArchiveMjs = async (
  bytes,
  specifier,
  _location,
  _packageLocation,
  packageName,
) => {
  const source = textDecoder.decode(bytes);
  const base = packageName
    .split('/')
    .slice(-1)
    .join('/');
  const sourceLocation = `.../${join(base, specifier)}`;
  const record = new StaticModuleRecord(source, sourceLocation);
  const pre = textEncoder.encode(JSON.stringify(record));
  return {
    parser: 'pre-mjs-json',
    bytes: pre,
    record,
  };
};
