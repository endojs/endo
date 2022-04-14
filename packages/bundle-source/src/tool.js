#!/usr/bin/env node
import '@endo/init';
import { ZipReader } from '@endo/zip';
import { decodeBase64 } from '@endo/base64';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { isEntrypoint } from './is-entrypoint.js';
import bundleSource from './index.js';

const { details: X, quote: q } = assert;

const USAGE =
  'bundle-source --to dest/ module1.js bundleName1 module2.js bundleName2 ...';

export const makeFileReader = (fileName, { fs, path }) => {
  const make = there => makeFileReader(there, { fs, path });
  return harden({
    toString: () => fileName,
    readText: () => fs.promises.readFile(fileName, 'utf-8'),
    neighbor: ref => make(path.resolve(fileName, ref)),
    stat: () => fs.promises.stat(fileName),
    absolute: () => path.normalize(fileName),
    relative: there => path.relative(fileName, there),
  });
};

export const makeFileWriter = (fileName, { fs, path }) => {
  const make = there => makeFileWriter(there, { fs, path });
  return harden({
    toString: () => fileName,
    writeText: txt => fs.promises.writeFile(fileName, txt),
    readOnly: () => makeFileReader(fileName, { fs, path }),
    neighbor: ref => make(path.resolve(fileName, ref)),
    mkdir: opts => fs.promises.mkdir(fileName, opts),
  });
};

export const exploreBundle = async endoZipBase64 => {
  const zip = new ZipReader(new Uint8Array(decodeBase64(endoZipBase64)));
  for await (const [name, _entry] of zip.files.entries()) {
    console.log({ name });
  }
};

export const makeBundleCache = (wr, cwd, readPowers) => {
  const add = async (rootPath, targetName) => {
    console.log(`${wr}`, 'add:', targetName, 'from', rootPath);
    const srcRd = cwd.neighbor(rootPath);

    const modTimeByPath = new Map();

    const loggedRead = async loc => {
      if (!loc.match(/\bpackage.json$/)) {
        try {
          const itemRd = cwd.neighbor(new URL(loc).pathname);
          const ref = srcRd.relative(itemRd.absolute());
          const { mtime } = await itemRd.stat();
          modTimeByPath.set(ref, mtime);
          // console.log({ loc, mtime, ref });
        } catch (oops) {
          console.error(oops);
        }
      }
      return readPowers.read(loc);
    };
    const bundle = await bundleSource(
      rootPath,
      {},
      { ...readPowers, read: loggedRead },
    );

    const { moduleFormat } = bundle;
    assert.equal(moduleFormat, 'endoZipBase64');

    const code = `export default ${JSON.stringify(bundle)};`;
    await wr.mkdir({ recursive: true });
    const bundleFileName = `bundle-${targetName}.js`;
    const bundleWr = wr.neighbor(bundleFileName);
    await bundleWr.writeText(code);
    const { mtime: bundleTime } = await bundleWr.readOnly().stat();

    const meta = {
      bundleFileName,
      bundleTime: bundleTime.toISOString(),
      moduleSource: {
        relative: bundleWr.readOnly().relative(srcRd.absolute()),
        absolute: srcRd.absolute(),
      },
      contents: [...modTimeByPath.entries()].map(([relativePath, mtime]) => ({
        relativePath,
        mtime: mtime.toISOString(),
      })),
    };

    await wr
      .neighbor(`bundle-${targetName}-meta.json`)
      .writeText(JSON.stringify(meta, null, 2));
    console.log(
      `${wr}`,
      'bundled',
      modTimeByPath.size,
      'files in',
      bundleFileName,
      'at',
      bundleTime,
    );
  };

  const validate = async targetName => {
    const metaRd = wr.readOnly().neighbor(`bundle-${targetName}-meta.json`);
    let txt;
    try {
      txt = await metaRd.readText();
    } catch (ioErr) {
      assert.fail(
        X`${q(targetName)}: cannot read bundle metadata: ${q(ioErr)}`,
      );
    }
    const meta = JSON.parse(txt);
    const {
      bundleFileName,
      bundleTime,
      contents,
      moduleSource: { relative: moduleRef },
    } = meta;
    assert.equal(bundleFileName, `bundle-${targetName}.js`);
    const { mtime: actualBundleTime } = await wr
      .readOnly()
      .neighbor(bundleFileName)
      .stat();
    assert.equal(actualBundleTime.toISOString(), bundleTime);
    const moduleRd = wr.readOnly().neighbor(moduleRef);
    const actualTimes = await Promise.all(
      contents.map(async ({ relativePath }) => {
        const itemRd = moduleRd.neighbor(relativePath);
        const { mtime } = await itemRd.stat();
        return { relativePath, mtime: mtime.toISOString() };
      }),
    );
    const outOfDate = actualTimes.filter(({ mtime }) => mtime > bundleTime);
    assert(
      outOfDate.length === 0,
      X`out of date: ${q(outOfDate)}. ${q(targetName)} bundled at ${q(
        bundleTime,
      )}`,
    );
    console.log(
      `${wr}`,
      `bundle-${targetName}.js`,
      'valid:',
      contents.length,
      'files bundled at',
      bundleTime,
    );
  };

  const validateOrAdd = async (rootPath, targetName) => {
    let valid = false;
    try {
      await validate(targetName);
      valid = true;
    } catch (invalid) {
      console.warn(invalid.message);
    }
    if (!valid) {
      await add(rootPath, targetName);
    }
  };

  return harden({
    add,
    validate,
    validateOrAdd,
  });
};

export const main = async (args, { fs, url, crypto, path }) => {
  const [to, dest, ...pairs] = args;
  if (!(to === '--to' && dest && pairs.length > 0 && pairs.length % 2 === 0)) {
    throw Error(USAGE);
  }

  const readPowers = makeReadPowers({ fs, url, crypto });
  const cwd = makeFileReader('', { fs, path });
  const destWr = makeFileWriter(dest, { fs, path });
  const cache = makeBundleCache(destWr, cwd, readPowers);

  for (let ix = 0; ix < pairs.length; ix += 2) {
    const [bundleRoot, bundleName] = pairs.slice(ix);

    // eslint-disable-next-line no-await-in-loop
    await cache.validateOrAdd(bundleRoot, bundleName);
  }
};

if (isEntrypoint(import.meta.url)) {
  /* global process */
  main(process.argv.slice(2), {
    fs: await import('fs'),
    path: await import('path'),
    url: await import('url'),
    crypto: await import('crypto'),
  }).catch(console.error);
}
