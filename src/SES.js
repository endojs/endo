import { createSESWithRealmConstructor } from './bundle/index.js';
import { creatorStrings } from './stringifiedBundle.js';
import Realm from '../proposal-realms/shim/src/realm.js';

export const SES = createSESWithRealmConstructor(creatorStrings, Realm);
