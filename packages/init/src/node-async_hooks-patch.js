import { setup } from './node-async_hooks.js';
import './node-async-local-storage-patch.js';

setup({ withDestroy: true });
