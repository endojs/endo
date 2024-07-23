import { withContext as withContextDoublerAgent } from './doubler-agent.js';

export const section = async (execa, testLine) => {
  await withContextDoublerAgent(execa, async () => {
    // So far, we have run guest programs like the doubler. Guests and hosts can exchange messages...
    await testLine(execa`endo mkguest alice alice-agent`, {
      stdout: 'Object [Alleged: EndoGuest] {}',
    });
    await testLine(execa`endo send alice ${'Please enjoy this @doubler.'}`);
    await testLine(execa`endo inbox --as alice-agent`, {
      stdout: /^0\. \"HOST\" sent \"Please enjoy this \@doubler\.\"/,
    });
    await testLine(execa`endo adopt --as alice-agent 0 doubler`);
    await testLine(execa`endo list --as alice-agent`, {
      stdout: 'doubler',
    });
    await testLine(execa`endo dismiss --as alice-agent 0`);
  });
};

/**
 * Wraps a function with the setup and teardown of the endo object state from sending-messages.
 *
 * @param {*} execa
 * @param {() => Promise<void} implementation
 * @returns {Promise<void>}
 */
export const withContext = async (execa, implementation) => {
  await withContextDoublerAgent(execa, async () => {
    try {
      await execa`endo mkguest alice alice-agent`;
      await execa`endo send alice ${'Please enjoy this @doubler.'}`;
      // await execa`endo adopt --as alice-agent 0 doubler`;
      await execa`endo adopt alice-agent 0 doubler`;
      await execa`endo dismiss --as alice-agent 0`;
      await implementation();
    } finally {
      await execa`endo remove alice-agent`;
    }
  });
};
