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

const n = 50;
for (let i = 0; i < n; i += 1) {
  test(`mapNodeModules() should return compartment descriptors containing shortest path (iteration ${i}/${n})`, async t => {
    t.timeout(5000);
    /** @type {string[] | undefined} */
    let expectedPath;
    const readPowers = makeReadPowers({ fs, url });
    const { maybeRead } = readPowers;

    // inserts a random delay before the read
    readPowers.maybeRead = async specifier => {
      await scheduler.wait(Math.random() * 50);
      return maybeRead(specifier);
    };

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
        `compartment descriptor should have had path: ${expectedPath.join('>')} (iteration ${i})`,
      );
    } else {
      expectedPath = /** @type {CompartmentDescriptor} */ (
        compartmentDescriptor
      ).path;
      t.assert(expectedPath, 'expectedPath should exist');
      t.log(
        `Expected path: ${/** @type {string[]} */ (expectedPath).join('>')}`,
      );
    }
  });
}
