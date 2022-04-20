import url from 'url';
import 'ses';
import { loadLocation } from '@endo/compartment-mapper';
import { nodeCoreModules } from './node-core-enough.js';
import { moduleTransforms } from './sesEvasionTransform.js';

export async function run({ 
  path, readPowers,
  shouldLockdown = false, shouldUseEvasionTransform = false 
}) {
  if (shouldLockdown) {
    lockdown();
  }
  let transforms;
  if (shouldUseEvasionTransform) {
    transforms = moduleTransforms;
  }

  const globals = {
    process, global, console, globalThis, btoa, atob, Buffer,
    ...globalThis,
  };


  const entrypoint = url.pathToFileURL(path);

  const application = await loadLocation(readPowers, entrypoint,{
      moduleTransforms: transforms,
  });

  try {

    await application.import({
      globals,
      modules: nodeCoreModules,
    });
  } catch (error) {
    console.error(error);
    process.exit(1)
  }
}
