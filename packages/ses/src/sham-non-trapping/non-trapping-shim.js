/* eslint-disable no-restricted-globals */
/* global globalThis */
import { ReflectPlus, ObjectPlus, ProxyPlus } from './non-trapping-pony.js';

globalThis.Reflect = ReflectPlus;

globalThis.Object = ObjectPlus;
// eslint-disable-next-line no-extend-native
Object.prototype.constructor = ObjectPlus;

globalThis.Proxy = ProxyPlus;
