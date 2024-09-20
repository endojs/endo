// Like test-sanity-unfiltered.js but with { stackFiltering: 'concise' }
import { makeSanityTests } from './_sanity.js';

// 'concise' is currently the default. But the purpose of this
// test is not to test what choice is the default. Since the behavior
// of this and the paired test-sanity-unfiltered.js tests depends
// on the settings, we set it explicitly.

makeSanityTests('concise');
