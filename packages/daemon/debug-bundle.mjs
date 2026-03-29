import '@endo/init/debug.js';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { mapNodeModules } from '@endo/compartment-mapper/node-modules.js';

const daemonEntry = path.resolve('src/daemon.js');
const read = async (location) => fs.promises.readFile(fileURLToPath(location));

const compartmentMap = await mapNodeModules(
  read,
  pathToFileURL(daemonEntry).toString(),
  { conditions: new Set(['default', 'endo']) },
);

// Find which compartment wants 'fs'.
for (const [name, compartment] of Object.entries(compartmentMap.compartments)) {
  if (compartment.modules) {
    for (const [mod, spec] of Object.entries(compartment.modules)) {
      if (mod === 'fs' || (spec && spec.compartment && spec.module === 'fs')) {
        console.log(`Package "${name}" requires "fs" →`, JSON.stringify(spec));
      }
    }
  }
}
