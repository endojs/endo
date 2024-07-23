import { withContext as withContextDaemon } from './daemon.js';

export const section = async (execa, testLine) => {
  await withContextDaemon(execa, async () => {
    // If a runlet returns a promise for some value, it will print that value before exiting gracefully.
    await testLine(execa`endo run runlet.js a b c`, {
      stdout: "Hello, World! [ 'a', 'b', 'c' ]\n42",
    });
  });
};
