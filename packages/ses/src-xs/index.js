/**
 * @module This is an alternate implementation of ../index.js to provide
 * access to the native implementation of Hardened JavaScript on the XS
 * engine, but adapted for backward compatibility with SES.
 * This module can only be reached in the presence of the package export/import
 * condition "xs", and should only be used to bundle an XS-specific version of
 * SES.
 */
// @ts-nocheck
/// <refs types="../types.js"/>

import { Object, freeze } from '../src/commons.js';

// These are the constituent shims in an arbitrary order, but matched
// to ../index.js to remove doubt.
import './lockdown-shim.js';
import './compartment-shim.js';
import '../src/assert-shim.js';
import '../src/console-shim.js';

// XS Object.freeze takes a second argument to apply freeze transitively, but
// with slightly different effects than `harden`.
// We disable this behavior to encourage use of `harden` for portable Hardened
// JavaScript.
/** @param {object} object */
Object.freeze = object => freeze(object);
