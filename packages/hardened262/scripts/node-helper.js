import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';

import './ses-shims.js';

const [subject, lockdownFlag, ...includes] = process.argv.slice(2);

for (const include of includes) {
  const contents = readFileSync(include, 'utf8');
  (0, eval)(contents);
}

if (lockdownFlag === 'lockdown') {
  lockdown();
}

globalThis.print = (...args) => console.log(...args);

await import(pathToFileURL(subject).href);
