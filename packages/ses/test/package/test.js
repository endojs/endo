// node -r esm test.js

// eslint-disable-next-line import/no-unresolved
import { lockdown } from 'ses';

lockdown();
// eslint-disable-next-line no-undef
console.log(Compartment);
