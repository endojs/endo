import 'ses';

import fs from 'node:fs';
import { scheduler } from 'node:timers/promises';
import url from 'node:url';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';

/**
 * @import {CompartmentDescriptor} from '../src/types.js'
 */

// since we cannot dynamically define tests in AVA (🤦‍♂️), this test will run in a loop.
test(`mapNodeModules() should return compartment descriptor containing shortest path`, async t => {
  await null;
  /** @type {string[] | undefined} */
  let expectedPath;
  for (let i = 0; i < 100; i++) {
    t.log(`iteration ${i}`);
    const readPowers = makeReadPowers({ fs, url });
    const moduleLocation = new URL(
      'fixtures-shortest-path/node_modules/app/index.js',
      import.meta.url,
    ).href;
    const compartmentMap = await mapNodeModules(readPowers, moduleLocation);

    const compartmentDescriptor = Object.values(
      compartmentMap.compartments,
    ).find(compartment => compartment.label === 'goofy-v1.0.0');

    t.assert(compartmentDescriptor, 'compartment descriptor should exist');
    // the assert() call above should mean that we do not need this type assertion,
    // but return type of `t.assert()` is incorrect; it should use the `asserts` keyword.

    if (expectedPath) {
      t.deepEqual(
        /** @type {CompartmentDescriptor} */ (compartmentDescriptor).path,
        expectedPath,
        `compartment descriptor should have had path: ${expectedPath.join('>')}`,
      );
    } else {
      expectedPath = /** @type {CompartmentDescriptor} */ (
        compartmentDescriptor
      ).path;
    }
  });
}
