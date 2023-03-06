// @ts-check

import vm from 'vm';
import fs from 'fs';

export function getVmEvalKit({ globals = {} } = {}) {
  // bundle contains ses-shim and lockdown() call so we run in fresh Realm
  const vmContext = vm.createContext({
    TextDecoder,
    TextEncoder,
    ...globals,
  });
  const vmEval = code => vm.runInContext(code, vmContext);
  const vmGlobalThis = vmEval('globalThis');
  return { vmEval, vmContext, vmGlobalThis };
}

export function getVmEvalKitUnderLockdown({ globals = {} } = {}) {
  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8');

  const { vmEval, vmContext, vmGlobalThis } = getVmEvalKit({ globals });
  vmEval(sesShim);
  vmEval('lockdown()');
  return { vmEval, vmContext, vmGlobalThis };
}
