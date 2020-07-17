/* global lockdown */
// 'lockdown' appears on the global as a side-effect of importing 'ses'
import 'ses';

// we need to enable Math.random as a workaround for 'brace-expansion' module
// (dep chain: cosmic-swingset/ag-solo->temp->glob->minimatch->brace-expansion)
// we need Date.now to build a timer device for cosmic-swingset
lockdown({ mathTaming: 'unsafe', dateTaming: 'unsafe', errorTaming: 'unsafe' });
// We are now in the "Start Compartment". Our global has all the same
// powerful things it had before, but the primordials have changed to make
// them safe to use in the arguments of API calls we make into more limited
// compartments

// 'Compartment' and 'harden' (and `StaticModuleRecord`) are now present in
// our global scope.
