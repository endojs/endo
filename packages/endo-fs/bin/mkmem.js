#!/usr/bin/env node
// Create an in-memory endo-fs `Filesystem` cap, registered as a
// formulated entry on the daemon. Wraps `endo make --UNCONFINED
// src/in-memory-module.js`.
//
// Usage:
//   endo-fs-mkmem --name <petName> [--worker <name>]
//
// Examples:
//   endo-fs-mkmem --name scratch
//   endo-fs-mkmem --name junk --worker @main

/* global process */

import { localModuleSpecifier, runEndoMake } from './_endo-make.js';

const USAGE = `Usage: endo-fs-mkmem --name <petName>
                      [--worker <workerName>]

Creates a fresh in-memory @endo/endo-fs Filesystem cap, registered
under the given pet name. The cap reincarnates across daemon restart
but its contents do not — the filesystem is rebuilt empty each time
the underlying module is re-instantiated.`;

const args = process.argv.slice(2);
let name;
let workerName;

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--name') {
    i += 1;
    name = args[i];
  } else if (a === '--worker' || a === '--workerName') {
    i += 1;
    workerName = args[i];
  } else if (a === '-h' || a === '--help') {
    // eslint-disable-next-line no-console
    console.log(USAGE);
    process.exit(0);
  } else {
    // eslint-disable-next-line no-console
    console.error(`Unexpected argument: ${a}\n\n${USAGE}`);
    process.exit(2);
  }
}

if (name === undefined) {
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

runEndoMake({
  moduleSpecifier: localModuleSpecifier('in-memory-module.js'),
  name,
  workerName,
});
