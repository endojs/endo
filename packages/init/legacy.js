// legacy.js - call tolerant lockdown with default Agoric shims
import { lockdown } from '@endo/lockdown';
import './pre-remoting.js';

// The loosest, non-stack-hiding SES environment.
// Useful for converting an existing app to start using lockdown.
const options = {
  overrideTaming: 'severe',
  stackFiltering: 'verbose',
  errorTaming: 'unsafe',
};
lockdown(options);
