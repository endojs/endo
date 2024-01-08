// @ts-check
// Detect if this is run as a script.
import * as url from 'url';
import * as process from 'process';
import * as fs from 'fs';

// Agoric still uses Endo dependencies under an emulation of ESM we call RESM
// because it is invoked with `node -r esm`.
// RESM does not support ?? nor ?. operators, so we must avoid them expressly.
// TODO remove when https://github.com/Agoric/agoric-sdk/issues/8671
const favor = (primary, secondary) =>
  primary === undefined ? secondary : primary;

// FIXME: Should maybe be exported by '@endo/something'?
export const isEntrypoint = href =>
  String(href) ===
  url.pathToFileURL(fs.realpathSync(favor(process.argv[1]))).href;
