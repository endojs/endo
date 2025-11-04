import test from 'ava';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixtures = ['i1.cjs', 'i1.mjs', 'i2.cjs', 'i2.mjs'];

const fixtureLocation = fileURLToPath(
  new URL('./fixtures-e2e-module-types', import.meta.url),
);

for (const entry of fixtures) {
  test(`Compare endo and node module loading of ${entry}`, async t => {
    console.log('Running test with entry:', entry);

    const nodeOutput = spawnSync(process.execPath, [`./${entry}`], {
      encoding: 'utf8',
      cwd: fixtureLocation,
    });
    const endoOutput = spawnSync(process.execPath, ['endo.js', `./${entry}`], {
      encoding: 'utf8',
      cwd: fixtureLocation,
    });

    if (nodeOutput.error) {
      throw nodeOutput.error;
    }
    if (endoOutput.error) {
      throw endoOutput.error;
    }

    t.log(`Node stdout:\n${nodeOutput.stdout}`);
    t.log(`Endo stdout:\n${endoOutput.stdout}`);

    if (nodeOutput.status !== 0) {
      t.log(`Node stderr:\n${nodeOutput.stderr}`);
    }
    if (endoOutput.status !== 0) {
      t.log(`Endo stderr:\n${endoOutput.stderr}`);
    }

    t.is(nodeOutput.stdout, endoOutput.stdout, `expected matching results`);

    // t.snapshot(
    //   {
    //     node: nodeOutput.stdout,
    //     endo: endoOutput.stdout,
    //   },
    //   `output for ${entry}`,
    // );
  });
}
