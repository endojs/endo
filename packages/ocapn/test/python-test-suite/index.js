// @ts-check

import '@endo/init';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { getSelectorName } from '../../src/selector.js';
import { makeTcpNetLayer } from '../../src/netlayers/tcp-test-only.js';
import { makeClient } from '../../src/client/index.js';
import { startGcScheduler } from '../_gc-util.js';

/**
 * @typedef {import('../../src/client/types.js').Client} Client
 */

/**
 * @param {Client} client
 * @returns {Map<string, any>}
 */
const makeTestObjectTable = client => {
  const testObjectTable = new Map();

  /**
   * Car Factory builder
   * 
   * This takes no arguments and returns a "Car Factory" object. It should be located
   * at the swiss num: "JadQ0++RzsD4M+40uLxTWVaVqM10DcBJ"
   * 
   * 
   * Car Factory
   * 
   * This takes a single argument which is a List, with the following entries:
   * 1. a symbol representing the color of the car
   * 2. a symbol representing the car model
   
   * It should spawn a "car" object of the model and color specified in the
   * List.
   * 
   * 
   * Car
   * 
   * This should take no arguments and respond with
   * "Vroom! I'm a <color> <model> car!"
   * Where <color> and <model> are the color and model of the car respectively.
   * 
   */
  testObjectTable.set(
    'JadQ0++RzsD4M+40uLxTWVaVqM10DcBJ',
    Far('carFactoryBuilder', () => {
      /**
       * @param {[model: any, color: any]} carSpec
       */
      return Far('carFactory', carSpec => {
        console.log('carFactory called with', { carSpec });

        const [colorSelector, modelSelector] = carSpec;
        const color = getSelectorName(colorSelector);
        const model = getSelectorName(modelSelector);
        const car = () => `Vroom! I am a ${color} ${model} car!`;

        return Far('car', car);
      });
    }),
  );

  /**
   * Echo GC
   *
   * This takes any number of arguments and returns them in the same order it got
   * them. Importantly this will be used to test the GC so it should not retain
   * references and should (if possible) try to arrange so that the run the GC after
   * each call.
   */
  testObjectTable.set(
    'IO58l1laTyhcrgDKbEzFOO32MDd6zE5w',
    Far('echoGc', async function echoGc(...args) {
      return args;
    }),
  );

  /**
   * Greeter
   *
   * This takes a single argument which is a reference to another object. Upon
   * receipt of a message it should send the greeting "Hello" (string) to the object
   * referenced by the argument.
   *
   * This greeting should be sent as a `op:deliver` (**not** `op:deliver-only`) and
   * the resulting promise should be discarded (no references retained). The
   * implementation should (if possible) try to arrange so that the GC is run
   * upon resolution of the promise.
   */
  testObjectTable.set(
    'VMDDd1voKWarCe2GvgLbxbVFysNzRPzx',
    Far('greeter', remoteObject => {
      console.log('greeter called with', { remoteObject });
      return E(remoteObject)('Hello');
    }),
  );

  /**
   * Promise resolver
   *
   * This takes no arguments and returns a promise and a resolver. When the resolver
   * is sent a message, the first argument should either be the symbol `break` or the
   * symbol `fulfill`, the other arguments should be the error or value to resolve the
   * promise with.
   */
  testObjectTable.set(
    'IokCxYmMj04nos2JN1TDoY1bT8dXh6Lr',
    Far('promiseResolver', () => {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      const resolver = Far('Resolver', {
        fulfill: value => {
          console.log('resolver.fulfill called with', { value });
          resolve(value);
        },
        break: reason => {
          console.log('resolver.break called with', { reason });
          reject(reason);
        },
      });

      return [promise, resolver];
    }),
  );

  /**
   * Sturdyref enlivener
   *
   * This takes a single argument which is an OCapN sturdyref object. The actor should
   * "enliven" (connect to the node and get a live reference to the object)
   * the sturdyref and then return that to the messager.
   */
  testObjectTable.set(
    'gi02I1qghIwPiKGKleCQAOhpy3ZtYRpB',
    Far('sturdyrefEnlivener', async sturdyref => {
      console.log('sturdyrefEnlivener called with', { sturdyref });
      // SturdyRefs are tagged objects that must be enlivened via the client
      return client.enlivenSturdyRef(sturdyref);
    }),
  );

  return testObjectTable;
};

const start = async () => {
  // Run the GC scheduler in the background
  startGcScheduler();

  const client = makeClient({ verbose: true });
  const testObjectTable = makeTestObjectTable(client);
  // Register the test objects with the client's swissnumTable
  for (const [swissStr, object] of testObjectTable.entries()) {
    client.registerSturdyRef(swissStr, object);
  }
  // Register netlayer with client
  await client.registerNetlayer((handlers, logger, captpVersion) =>
    makeTcpNetLayer({
      handlers,
      logger,
      captpVersion,
      specifiedPort: 22046,
    }),
  );
};

start();
