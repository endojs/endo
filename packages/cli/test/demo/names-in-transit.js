import { withContext as withContextSendingMessages } from './sending-messages.js';

export const section = async (execa, testLine) => {
  await withContextSendingMessages(execa, async () => {
    // In this example, we send alice our "doubler" but let it appear...
    await testLine(
      execa`endo send alice ${'Please enjoy this @counter:doubler.'}`,
    );
    await testLine(execa`endo inbox --as alice-agent`, {
      stdout: /^1\. \"HOST\" sent \"Please enjoy this \@counter\.\"/,
    });
    await testLine(
      execa`endo adopt --as alice-agent 1 counter --name redoubler`,
    );
    await testLine(execa`endo list --as alice-agent`, {
      stdout: 'redoubler',
    });
    await testLine(execa`endo dismiss --as alice-agent 1`);
  });
};

/**
 * Wraps a function with the setup and teardown of the endo object state from names-in-transit.
 *
 * @param {*} execa
 * @param {() => Promise<void} implementation
 * @returns {Promise<void>}
 */
export const withContext = async (execa, implementation) => {
  await withContextSendingMessages(execa, async () => {
    try {
      await execa`endo send alice ${'Please enjoy this @counter:doubler.'}`;
      await execa`endo inbox --as alice-agent`;
      await execa`endo adopt --as alice-agent 1 counter --name redoubler`;
      await execa`endo dismiss --as alice-agent 1`;
      await implementation();
    } finally {
      return;
    }
  });
};
