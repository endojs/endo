/* global lockdown */

// 'lockdown' appears on the global as a side-effect of importing 'ses'
import 'ses';

// Install our HandledPromise global.
import '@agoric/eventual-send/shim';

lockdown({ errorTaming: 'unsafe' });
// We are now in the "Start Compartment". Our global has all the same
// powerful things it had before, but the primordials have changed to make
// them safe to use in the arguments of API calls we make into more limited
// compartments

// 'Compartment' and 'harden' (and `StaticModuleRecord`) are now present in
// our global scope.
