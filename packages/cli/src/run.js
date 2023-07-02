/* global process */
import { E, Far } from '@endo/far';
import bundleSource from '@endo/bundle-source';
import url from 'url';

const endowments = harden({
  assert,
  E,
  Far,
  TextEncoder,
  TextDecoder,
  URL,
  console,
});

export const run = async (
  { provideEndoClient, cancel, cancelled, sockPath },
  {
    as: partyNames,
    file: filePath,
    bundle: bundleName,
    UNSAFE: importPath,
    powers: powersName = 'NONE',
    args,
  },
) => {
  if (
    filePath === undefined &&
    importPath === undefined &&
    bundleName === undefined
  ) {
    console.error('Specify at least one of --file, --bundle, or --UNSAFE');
    process.exitCode = 1;
    return;
  }

  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }

    let powersP;
    if (powersName === 'NONE') {
      powersP = E(bootstrap).leastAuthority();
    } else if (powersName === 'HOST') {
      powersP = party;
    } else if (powersName === 'ENDO') {
      powersP = bootstrap;
    } else {
      powersP = E(party).provideGuest(powersName);
    }

    if (importPath !== undefined) {
      if (bundleName !== undefined) {
        console.error('Must specify either --bundle or --UNSAFE, not both');
        process.exitCode = 1;
        return;
      }
      if (filePath !== undefined) {
        args.unshift(filePath);
      }

      const importUrl = url.pathToFileURL(importPath);
      const namespace = await import(importUrl);
      const result = await namespace.main(powersP, ...args);
      if (result !== undefined) {
        console.log(result);
      }
    } else {
      /** @type {any} */
      let bundle;
      if (bundleName !== undefined) {
        if (importPath !== undefined) {
          console.error('Must specify either --bundle or --UNSAFE, not both');
          process.exitCode = 1;
          return;
        }
        if (filePath !== undefined) {
          args.unshift(filePath);
        }

        const readableP = E(party).provide(bundleName);
        const bundleText = await E(readableP).text();
        bundle = JSON.parse(bundleText);
      } else {
        bundle = await bundleSource(filePath);
      }

      // We defer importing the import-bundle machinery to this in order to
      // avoid an up-front cost for workers that never use importBundle.
      const { importBundle } = await import('@endo/import-bundle');
      const namespace = await importBundle(bundle, {
        endowments,
      });
      const result = await namespace.main(powersP, ...args);
      if (result !== undefined) {
        console.log(result);
      }
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
