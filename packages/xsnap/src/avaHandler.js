/* global globalThis __dirname __filename */
/* set up globalThis.handleCommand for running test scripts

See avaXS.js for the way this is run inside an xsnap process.

issueCommand is provided by xsnap.
test global is defined in avaAssertXS.js .
HandledPromise is defined by eventual send shim.

*/
/* global HandledPromise, issueCommand, test */
// @ts-check
// eslint-disable-next-line spaced-comment
/// <reference types="ses" />
// eslint-disable-next-line spaced-comment
/// <reference types="@agoric/eventual-send" />

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * @param { { testNames: string[] } |
 *          { bundleSource: [string, ...unknown[]] } |
 *          TapMessage | Summary } item
 * @typedef {import('./avaXS').Summary} Summary
 */
function send(item) {
  const msg = encoder.encode(JSON.stringify(item)).buffer;
  return issueCommand(msg);
}

/**
 * @param { string } startFilename
 * @param {...unknown} args
 */
const bundleSource = async (startFilename, ...args) => {
  const msg = await send({ bundleSource: [startFilename, ...args] });
  return JSON.parse(decoder.decode(msg));
};

const harness = test.createHarness(send); // ISSUE: global mutable state

const testRequire = function require(specifier) {
  switch (specifier) {
    case 'ava':
      return test;
    case 'ses':
      return undefined;
    case '@agoric/ses-ava':
      return { wrapTest: test => test };
    case '@agoric/install-ses':
      return undefined;
    case '@agoric/install-metering-and-ses':
      console.log('TODO: @agoric/install-metering-and-ses');
      return undefined;
    case '@agoric/bundle-source':
      return bundleSource;
    default:
      throw Error(specifier);
  }
};

/** @param {ArrayBuffer} rawMessage */
function handler(rawMessage) {
  /**
   * @type {{ method: 'loadScript', source: string } | { method: 'runTest', name: string }}
   */
  const msg = JSON.parse(decoder.decode(rawMessage));

  switch (msg.method) {
    case 'loadScript': {
      const { source } = msg;
      const virtualObjectGlobals =
        // @ts-ignore
        // eslint-disable-next-line no-undef
        typeof makeKind !== 'undefined' ? { makeKind, makeWeakStore } : {};
      // @ts-ignore How do I get ses types in scope?!?!?!
      const c = new Compartment({
        require: testRequire,
        __dirname,
        __filename,
        console,
        // @ts-ignore
        assert,
        // @ts-ignore
        HandledPromise,
        TextEncoder,
        TextDecoder,
        ...virtualObjectGlobals,
      });
      try {
        c.evaluate(`(${source}\n)()`);
        send({ testNames: harness.testNames() });
      } catch (ex) {
        send({
          status: 'not ok',
          message: `running test script: ${ex.message}`,
        });
      }
      break;
    }

    case 'runTest': {
      const { name } = msg;
      harness.run(name).catch(ex =>
        send({
          status: 'not ok',
          message: `${name} threw: ${ex.message}`,
        }),
      );
      break;
    }

    default:
      console.log('bad method', msg);
  }
  return undefined;
}

globalThis.handleCommand = harden(handler);
