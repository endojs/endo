/**
 * @param {import('@endo/patterns').AwaitArgGuardPayload} payload
 */
export const makeLegacyAwaitArgGuard = payload =>
  harden({
    klass: 'awaitArg',
    ...payload,
  });
harden(makeLegacyAwaitArgGuard);

/**
 * @param {import('@endo/patterns').MethodGuardPayload} payload
 */
export const makeLegacyMethodGuard = payload =>
  harden({
    klass: 'methodGuard',
    ...payload,
  });
harden(makeLegacyMethodGuard);

/**
 * @param {import('@endo/patterns').InterfaceGuardPayload} payload
 */
export const makeLegacyInterfaceGuard = payload =>
  harden({
    klass: 'Interface',
    ...payload,
  });
harden(makeLegacyInterfaceGuard);
