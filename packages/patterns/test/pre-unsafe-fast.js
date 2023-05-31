import { lockdown } from '@endo/lockdown';
import '@endo/init/pre-remoting.js';

const options = {
  __hardenTaming__: 'unsafe',
  errorTaming: 'unsafe',
  overrideTaming: 'min',
  domainTaming: 'unsafe',
};
lockdown(options);
