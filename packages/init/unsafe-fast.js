// unsafe-fast.js - call lockdown with performant but unsafe options
import { lockdown } from '@endo/lockdown';
import './pre-remoting.js';

const options = {
  __hardenTaming__: 'unsafe',
};
lockdown(options);
