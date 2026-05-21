#!/usr/bin/env node
// Attach a host directory to the daemon as a formulated endo-fs
// `Filesystem` cap. Wraps `endo make --UNCONFINED
// src/node-fs-module.js` with sensible defaults and a flag-style
// CLI.
//
// Usage:
//   endo-fs-attach <path> --name <petName> [--read-only]
//                                          [--worker <name>]
//
// Examples:
//   endo-fs-attach /tmp/workspace --name workspace
//   endo-fs-attach ~/code --name code --read-only
//   endo-fs-attach /srv/data --name data --worker @main

/* global process */

import path from 'node:path';
import { localModuleSpecifier, runEndoMake } from './_endo-make.js';

const USAGE = `Usage: endo-fs-attach <path> --name <petName>
                       [--read-only] [--worker <workerName>]

Attaches the given host directory to the daemon as a formulated
@endo/endo-fs Filesystem cap, addressable by the pet name.`;

const args = process.argv.slice(2);
let sourcePath;
let name;
let readOnly = false;
let workerName;

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--name') {
    i += 1;
    name = args[i];
  } else if (a === '--read-only' || a === '-r') {
    readOnly = true;
  } else if (a === '--worker' || a === '--workerName') {
    i += 1;
    workerName = args[i];
  } else if (a === '-h' || a === '--help') {
    // eslint-disable-next-line no-console
    console.log(USAGE);
    process.exit(0);
  } else if (a.startsWith('-')) {
    // eslint-disable-next-line no-console
    console.error(`Unknown flag: ${a}\n\n${USAGE}`);
    process.exit(2);
  } else if (sourcePath === undefined) {
    sourcePath = a;
  } else {
    // eslint-disable-next-line no-console
    console.error(`Unexpected positional argument: ${a}\n\n${USAGE}`);
    process.exit(2);
  }
}

if (sourcePath === undefined || name === undefined) {
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

const resolvedPath = path.resolve(sourcePath);
const env = [`ENDO_FS_ROOT=${resolvedPath}`];
if (readOnly) env.push('ENDO_FS_READ_ONLY=1');

runEndoMake({
  moduleSpecifier: localModuleSpecifier('node-fs-module.js'),
  name,
  workerName,
  env,
});
