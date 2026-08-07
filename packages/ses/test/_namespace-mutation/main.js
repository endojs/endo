import process from 'node:process';

import { result } from './b.js';
import { seenByLaterImport } from './c.js';

process.stdout.write(JSON.stringify({ result, seenByLaterImport }));
