// @ts-check

import {
  TypeError,
  globalThis,
  getOwnPropertyDescriptor,
  defineProperty,
} from './commons.js';

export function tameDomains(domainTaming = 'safe') {
  if (domainTaming === 'unsafe') {
    return;
  }

  // Protect against the hazard presented by Node.js domains.
  const globalProcess = globalThis.process || undefined;
  if (typeof globalProcess === 'object') {
    // Check whether domains were initialized.
    const domainDescriptor = getOwnPropertyDescriptor(globalProcess, 'domain');
    if (domainDescriptor !== undefined && domainDescriptor.get !== undefined) {
      // The domain descriptor on Node.js initially has value: null, which
      // becomes a get, set pair after domains initialize.
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_DOMAINS.md
      throw TypeError(
        `SES failed to lockdown, Node.js domains have been initialized (SES_NO_DOMAINS)`,
      );
    }
    // Prevent domains from initializing.
    // This is clunky because the exception thrown from the domains package does
    // not direct the user's gaze toward a knowledge base about the problem.
    // The domain module merely throws an exception when it attempts to define
    // the domain property of the process global during its initialization.
    // We have no better recourse because Node.js uses defineProperty too.
    defineProperty(globalProcess, 'domain', {
      value: null,
      configurable: false,
      writable: false,
      enumerable: false,
    });
  }
}
