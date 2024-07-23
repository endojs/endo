import { withContext as withContextDaemon } from './daemon.js';

export const section = async (execa, testLine) => {
  await withContextDaemon(execa, async () => {
    // We can create an instance of the counter and give it a name.
    await testLine(execa`endo make counter.js --name counter`, {
      stdout: 'Object [Alleged: Counter] {}',
    });

    // Then, we can send messages to the counter and see their responses...
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '1',
    });
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '2',
    });
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '3',
    });

    // Aside: in all the above cases, we use counter both as the property name...
    await testLine(execa`endo eval E(c).incr() c:counter`, {
      stdout: '4',
    });

    // Endo preserves the commands that led to the creation of the counter value...
    await testLine(execa`endo restart`);
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '1',
    });
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '2',
    });
    await testLine(execa`endo eval E(counter).incr() counter`, {
      stdout: '3',
    });

    // Aside, since Eventual Send, the machinery under the E operator...
    await testLine(execa`endo spawn greeter`);
    await testLine(
      execa`endo eval --worker greeter '${'Hello, World!'}' --name greeting`,
      {
        stdout: 'Hello, World!',
      },
    );
    await testLine(execa`endo show greeting`, {
      stdout: 'Hello, World!',
    });
  });
};

/**
 * Wraps a function with the setup and teardown of the endo object state from counter-example.
 *
 * @param {*} execa
 * @param {() => Promise<void>} implementation
 * @returns {Promise<void>}
 */
export const withContext = async (execa, implementation) => {
  await withContextDaemon(execa, async () => {
    try {
      await execa`endo make counter.js --name counter`;
      await execa`endo eval E(counter).incr() counter`;
      await execa`endo eval E(counter).incr() counter`;
      await execa`endo eval E(counter).incr() counter`;
      await execa`endo spawn greeter`;
      await implementation();
    } finally {
      await execa`endo remove greeter`;
      await execa`endo remove counter`;
    }
  });
};
