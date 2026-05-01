// Like test-sanity.js but with { stackFiltering: 'verbose' }
import './_lockdown-verbose.js';
import { makeSanityTests } from './_sanity.js';

makeSanityTests('verbose');
