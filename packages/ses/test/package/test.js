// node -r esm test.js

// TODO The following eslint-disable comment causes a "yarn lint"
// in packages/ses to complain that its disbaling something that isn't
// reported. However, removing it causes a "yarn lint" at the root
// under CI to complain of an import/no-unresolved. CI is more important,
// so we currently choose to appease it.

// eslint-disable-next-line import/no-unresolved
import { lockdown } from 'ses';

lockdown();
// eslint-disable-next-line no-undef
console.log(Compartment);
