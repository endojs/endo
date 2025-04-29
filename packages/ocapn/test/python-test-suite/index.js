// @ts-check

import '@endo/init';

import { getSelectorName } from '../../src/pass-style-helpers.js';
import { makeTcpNetLayer } from '../../src/netlayers/tcp-test-only.js';
import { makeClient } from '../../src/client.js';

/**
 * @typedef {import('../../src/client.js').RemoteObjectHelper} RemoteObjectHelper
 */

const testObjectTable = new Map();

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
  async function echoGc(...args) {
    return args;
  },
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
  function greeter(remoteObject) {
    const callHelper = /** @type {RemoteObjectHelper} */ (this);
    callHelper.deliver(remoteObject, 'Hello');
  },
);

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
  function carFactoryBuilder() {
    const factoryBuilderCallHelper = /** @type {RemoteObjectHelper} */ (this);

    /**
     * @param {[model: any, color: any]} carSpec
     */
    function carFactory(carSpec) {
      console.log('carFactory called with', { carSpec });
      const carFactoryCallHelper = /** @type {RemoteObjectHelper} */ (this);

      const [colorSelector, modelSelector] = carSpec;
      const color = getSelectorName(colorSelector);
      const model = getSelectorName(modelSelector);
      const car = () => `Vroom! I am a ${color} ${model} car!`;

      return carFactoryCallHelper.registerExport(car);
    }

    return factoryBuilderCallHelper.registerExport(carFactory);
  },
);

const client = makeClient({ makeDefaultSwissnumTable: () => testObjectTable });
makeTcpNetLayer({ handleMessage: client.handleMessage });
