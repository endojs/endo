/* global globalThis */
import { ReflectPlus, ObjectPlus, ProxyPlus } from './src/no-trapping-pony.js';

globalThis.Reflect = ReflectPlus;

globalThis.Object = ObjectPlus;
// eslint-disable-next-line no-extend-native
Object.prototype.constructor = ObjectPlus;

globalThis.Proxy = ProxyPlus;
