// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';
import { encodeSyrup } from '@endo/syrup/encode';

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  const record = new StaticModuleRecord(source, location);
  const pre = encodeSyrup(record);
  return {
    parser: 'premjs',
    bytes: pre,
    record,
  };
};
