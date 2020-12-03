// import "./ses-lockdown.js";
import 'ses';
import fs from 'fs';
import test from 'ava';
import { loadLocation } from '../src/main.js';

test('transforms applied to evaluation', async t => {
  t.plan(1);

  const fixture = new URL(
    'node_modules/evaluator/evaluator.js',
    import.meta.url,
  ).toString();
  const read = async location =>
    fs.promises.readFile(new URL(location).pathname);

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.import({
    globals: {
      code: '"hello"',
    },
    transforms: [
      function transform(source) {
        return source.replace(/ll/g, 'y');
      },
    ],
  });
  const { default: value } = namespace;
  t.is(value, 'heyo', 'code evaluated in compartment is transforemd');
});
