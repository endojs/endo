// @ts-check

import { decodeSyrup } from '@endo/syrup/decode';

/** @type {ParseFn} */
export const parsePreMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const record = decodeSyrup(bytes, { name: location });
  return {
    parser: 'premjs',
    bytes,
    record,
  };
};
