// @ts-check

import vm from 'vm';
import fs from 'fs';

export function getVmEval({ globals = {} } = {}) {
  // bundle contains ses-shim and lockdown() call so we run in fresh Realm
  const vmContext = vm.createContext({
    TextDecoder,
    TextEncoder,
    console,
    ...globals,
  });
  const vmEval = code => vm.runInContext(code, vmContext);
  return vmEval;
}

export function getVmEvalUnderLockdown({ globals = {} } = {}) {
  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8');

  const vmEval = getVmEval({ globals });
  vmEval(sesShim);
  vmEval('lockdown()');
  return vmEval;
}
