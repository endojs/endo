import { createSESWithRealmConstructor } from './bundled/index.js';
import { creatorStrings } from './bundle.js';
import Realm from '../proposal-realms/shim/src/realm.js';

export const SES = createSESWithRealmConstructor(creatorStrings, Realm);
