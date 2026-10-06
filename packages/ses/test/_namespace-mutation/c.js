import { x as namedX } from './a.js';
import * as foo from './a.js';

export const seenByLaterImport = { namedX, starX: foo.x };
