import { withContext as withContextCounterExample } from './counter-example.js';

export const section = async (execa, testLine) => {
  await withContextCounterExample(execa, async () => {
    // We make a doubler mostly the same way we made the counter...
    await testLine(execa`endo mkguest doubler-handle doubler-agent`, {
      stdout: 'Object [Alleged: EndoGuest] {}',
    });
    await testLine(
      execa`endo make doubler.js --name doubler --powers doubler-agent`,
    );

    // This creates a doubler, but the doubler cannot respond until we resolve...
    await testLine(execa`endo inbox`, {
      stdout:
        /^0\. "doubler-handle" requested "a counter, suitable for doubling"/,
    });
    await testLine(execa`endo resolve 0 counter`);

    // Now we can get a response from the doubler.
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '8',
    });
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '10',
    });
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '12',
    });

    // Also, in the optional second argument to request, doubler.js names...
    await testLine(execa`endo restart`);
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '2',
    });
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '4',
    });
    await testLine(execa`endo eval E(doubler).incr() doubler`, {
      stdout: '6',
    });
  });
};

/**
 * Wraps a function with the setup and teardown of the endo object state from doubler-agent.
 *
 * @param {*} execa
 * @param {() => Promise<void} implementation
 * @returns {Promise<void>}
 */
export const withContext = async (execa, implementation) => {
  await withContextCounterExample(execa, async () => {
    try {
      await execa`endo mkguest doubler-handle doubler-agent`;
      await execa`endo make doubler.js --name doubler --powers doubler-agent`;
      await execa`endo inbox`;
      await execa`endo resolve 0 counter`;
      await implementation();
    } finally {
      await execa`endo remove doubler`;
      await execa`endo remove doubler-agent`;
      await execa`endo remove doubler-handle`;
    }
  });
};
