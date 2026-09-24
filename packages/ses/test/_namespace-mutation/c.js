import { x as namedX } from './a.cjs';
import * as foo from './a.cjs';

export const seenByLaterImport = { namedX, starX: foo.x };
