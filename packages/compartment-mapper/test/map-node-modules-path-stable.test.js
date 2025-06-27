import 'ses';

import fs from 'node:fs';
import { scheduler } from 'node:timers/promises';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
/**
 * @import {CompartmentDescriptor, MaybeReadFn} from '../src/types.js'
 */


/**
 * We will iterate at most _n_ times to trigger path flakiness
 */
const shortestPathTestCount = 20;

const readPowers = makeReadPowers({ fs });

const fixture = {
  a: ['aa', 'aaaaa5'],
  aaaaa5: ['eee'],
  aa: ['ffff', 'xbb', 'cc'],
  xbb: ['dd'],
  cc: ['xbb', 'eee'],
  dd: ['z'],
  eee: ['z'],
  ffff: ['ggg'],
  ggg: ['j'],
  j: ['z']
}

const tree = (start, depth = 0) => {
  console.log('  '.repeat(depth) + start)
  if (fixture[start]) fixture[start].forEach(dep => tree(dep, depth + 1))
}
/**
 * Inserts a random delay before the read to goad it into non-determinism (which
 * should fail)
 * @type {MaybeReadFn}
 */
readPowers.maybeRead = async specifier => {
  const chunks = specifier.split('node_modules/')
  if (chunks.length > 2) { return }
  await scheduler.wait(Math.random() * 50);
  const k = chunks[1].replace('/package.json', '')
  const deps = fixture[k] || [];
  return Buffer.from(`{
      "name":"${k}",
      "version":"1.0.0",
      "dependencies":{
      ${deps.map(d => `"${d}":"1.0.0"`).join()}}
      }`)
};

test(`mapNodeModules() should be path stable`, async t => {
  let expectedPath
  t.plan(shortestPathTestCount);
  for (let i = 0; i < shortestPathTestCount; i += 1) {

    const compartmentMap = await mapNodeModules(
      readPowers,
      'file:///node_modules/a/index.js',
    );


    const compartmentDescriptor = Object.values(
      compartmentMap.compartments,
    ).find(compartment => compartment.label === 'z-v1.0.0');

    if (i === 0) {
      expectedPath = compartmentDescriptor.path
      t.log(JSON.stringify(compartmentMap))
      tree('a')
      console.log(expectedPath)

    }

    t.deepEqual(
      compartmentDescriptor.path?.join('>'),
      expectedPath.join('>'),
      `paths differ with compartment map:
      ${JSON.stringify(compartmentMap)}`,
    );

  }

});
