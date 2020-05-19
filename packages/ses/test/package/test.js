// node -r esm test.js
/* global Compartment, lockdown */

import 'ses';

lockdown();
console.log(Compartment);
