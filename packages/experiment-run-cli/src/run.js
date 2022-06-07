import url from 'url';
import 'ses';
import { loadLocation } from '@endo/compartment-mapper';
import { nodeCoreModules } from './node-core-enough.js';
import { moduleTransforms } from './sesEvasionTransform.js';

export async function run({ 
  path, readPowers,
  shouldLockdown = false, shouldUseEvasionTransform = false, shouldEndowAll = true, verboseLockdown = false,
}) {
  if (verboseLockdown) {
    lockdown({"errorTaming":"unsafe","stackFiltering":"verbose","overrideTaming":"severe","overrideDebug":["constructor", "toString"]});
  }
  if (shouldLockdown) {
    lockdown();
  }
  
  let transforms;
  if (shouldUseEvasionTransform) {
    transforms = moduleTransforms;
  }

  let globals;
  if(shouldEndowAll){
    globals = {
      process, global, console, globalThis, /*btoa, atob,*/ Buffer,
      ...globalThis,
    };
  } else {
    globals = { console }
  }


  const entrypoint = url.pathToFileURL(path);

  const application = await loadLocation(readPowers, entrypoint,{
      moduleTransforms: transforms,
      dev: true,
  });

  try {

    await application.import({
      globals,
      modules: shouldEndowAll?nodeCoreModules:{},
    });
  } catch (error) {
    console.error(error);
    process.exit(1)
  }
}
