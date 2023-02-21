import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import vm from 'vm';
import {
  makeBundle,
  makeSecureBundle,
  makeSecureBundleFromArchive,
  makeArchive,
  parseArchive,
} from '../index.js';
import { makeReadPowers } from '../node-powers.js';

const fixture = new URL(
  'fixtures-0/node_modules/bundle/main.js',
  import.meta.url,
).toString();

const { read } = makeReadPowers({ fs, url });

const expectedLog = [
  'dependency',
  'foo',
  {
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  },
  {
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  },
  'fizz',
  'buzz',
  'blue',
  'qux',
  '#777',
  {
    red: '#f00',
    green: '#0f0',
    blue: '#00f',
  },
  {
    default: {
      zzz: 1,
      fromMjs: 'foo',
    },
    fromMjs: 'foo',
    zzz: 1,
  },
];

test('bundles work', async t => {
  const bundle = await makeBundle(read, fixture);
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({ print });
  compartment.evaluate(bundle);
  t.deepEqual(log, expectedLog);
});

test('equivalent archive behaves the same as bundle', async t => {
  const log = [];
  const print = entry => {
    log.push(entry);
  };

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive, fixture);
  await application.import({
    globals: { print },
  });
  t.deepEqual(log, expectedLog);
});

test('secure bundles work', async t => {
  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8');
  const bundle = await makeSecureBundle(read, fixture);
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  // bundle contains ses-shim and lockdown() call so we run in fresh Realm
  const vmContext = vm.createContext({
    print,
    TextDecoder,
    TextEncoder,
  });
  const vmEval = code => vm.runInContext(code, vmContext);
  vmEval(sesShim);
  vmEval('lockdown()');
  const appExecPromise = vmEval(bundle);
  const { namespace } = await appExecPromise;
  t.deepEqual(namespace, {
    xyz: 123,
  });
  t.deepEqual(log, expectedLog);
});

test('secure bundle from archive works', async t => {
  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8');
  const archiveBytes = await makeArchive(read, fixture);
  const fakeArchiveLocation = new URL('app.agar', import.meta.url).toString();
  const readWithArchive = async path => {
    if (path === fakeArchiveLocation) {
      return archiveBytes;
    }
    return read(path);
  };
  const readPowers = { read: readWithArchive };
  const bundle = await makeSecureBundleFromArchive(
    readPowers,
    fakeArchiveLocation,
  );
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  // bundle contains ses-shim and lockdown() call so we run in fresh Realm
  const vmContext = vm.createContext({
    print,
    TextDecoder,
    TextEncoder,
  });
  const vmEval = code => vm.runInContext(code, vmContext);
  vmEval(sesShim);
  vmEval('lockdown()');
  const appExecPromise = vmEval(bundle);
  const { namespace } = await appExecPromise;
  t.deepEqual(namespace, {
    xyz: 123,
  });
  t.deepEqual(log, expectedLog);
});

test('secure bundler safely sandboxes modules', async t => {
  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const appEntryLocation = new URL(
    'fixtures-0/node_modules/bundle-unsafe/main.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8');
  const bundle = await makeSecureBundle(read, appEntryLocation);
  // bundle contains ses-shim and lockdown() call so we run in fresh Realm
  const vmContext = vm.createContext({
    TextDecoder,
    TextEncoder,
  });
  const vmEval = code => vm.runInContext(code, vmContext);
  vmEval(sesShim);
  vmEval('lockdown()');
  const appExecPromise = vmEval(bundle);
  const {
    namespace: { myGlobalThis, myEval },
  } = await appExecPromise;
  // ensure the modules compartment global is not the realm global or context object
  // nodejs vm implements a half-baked membrane with the vm realm globalThis and the context object
  // wrapping in an array defeats the membrane
  t.not(vmEval('globalThis'), myGlobalThis);
  t.not(vmEval('[globalThis][0]'), myGlobalThis);
  // ensure this is not the feral eval
  t.is(myEval, myGlobalThis.eval);
});
