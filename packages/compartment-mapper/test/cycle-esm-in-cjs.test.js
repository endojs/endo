/**
 * Cyclic ESM-in-CommonJS divergence scenario exercised through the
 * compartment-mapper test scaffold. SES allows the topology that Node.js
 * rejects with ERR_REQUIRE_CYCLE_MODULE; this test pins SES's actual
 * behavior so the divergence is verified programmatically rather than
 * documented narratively. The companion Node.js parity test in
 * cycle-esm-in-cjs-node-parity.test.js verifies the Node.js side of the
 * divergence by spawning Node on the same fixture and asserting the error
 * code.
 *
 * Topology (under fixtures-cycle-esm-in-cjs/node_modules/app/):
 *
 *   main.mjs:   import * as bridge from './bridge.cjs';
 *               export const bridgeValue = bridge.value;
 *   bridge.cjs: const m = require('./peer.mjs');
 *               exports.value = m.value;
 *   peer.mjs:   import { value as bridgeValue } from './bridge.cjs';
 *               export const value = 42;
 *
 * On the SES side, bridge.cjs reads `m.value` from peer.mjs's namespace
 * after the cycle's back-edge has reached peer.mjs (which then re-entered
 * bridge.cjs). Because the ESM side resolves through live bindings, by the
 * time main reads bridge.value the snapshot capture in bridge.cjs sees
 * peer.mjs's `value = 42`.
 */

/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-cycle-esm-in-cjs/node_modules/app/main.mjs',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  t.is(namespace.bridgeValue, 42);
};

scaffold(
  'cycle-esm-in-cjs (issue #59 follow-up: divergence)',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
