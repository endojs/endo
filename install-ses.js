/* global LOCKDOWN_OPTIONS process */
// 'lockdown' appears on the global as a side-effect of importing 'ses'
import 'ses';

// Install our HandledPromise global.
import '@agoric/eventual-send/shim';

// For testing under Ava, and also sometimes for testing and debugging in
// general, when safety is not needed, you perhaps want to use
// packages/SwingSet/tools/install-ses-debug.js instead of this one.
// If you're using a prepare-test-env-ava.js, it is probably already doing that
// for you.

// The`@agoric/import-ses` package exists so the "main" of production code can
// start with the following import or its equivalent.
// ```js
// import '@agoric/install-ses';
// ```
// But production code must also be tested. Normal ocap discipline of passing
// explicit arguments into the `lockdown`
// call would require an awkward structuring of start modules, since
// the `install-ses` module calls `lockdown` during its initialization,
// before any explicit code in the start module gets to run. Even if other code
// does get to run first, the `lockdown` call in this module happens during
// module initialization, before it can legitimately receive parameters by
// explicit parameter passing.
//
// Instead, for now, `install-ses` violates normal ocap discipline by feature
// testing global state for a passed "parameter". This is something that a
// module can but normally should not do, during initialization or otherwise.
// Initialization is often awkward.
//
// The `install-ses` module tests, first,
// for a JavaScript global named `LOCKDOWN_OPTIONS`, and second, for an
// environment
// variable named `LOCKDOWN_OPTIONS`. If either is present, its value should be
// a JSON encoding of the options bag to pass to the `lockdown` call. If so,
// then `install-ses` calls `lockdown` with those options. If there is no such
// feature, `install-ses` calls `lockdown` with appropriate settings for
// production use.

let optionsString;
if (typeof LOCKDOWN_OPTIONS === 'string') {
  optionsString = LOCKDOWN_OPTIONS;
  console.log(
    `'@agoric/install-ses' sniffed and found a 'LOCKDOWN_OPTIONS' global variable\n`,
  );
} else if (
  typeof process === 'object' &&
  typeof process.env.LOCKDOWN_OPTIONS === 'string'
) {
  optionsString = process.env.LOCKDOWN_OPTIONS;
  console.log(
    `'@agoric/install-ses' sniffed and found a 'LOCKDOWN_OPTIONS' environment variable\n`,
  );
}

if (typeof optionsString === 'string') {
  let options;
  try {
    options = JSON.parse(optionsString);
  } catch (err) {
    console.error('Environment variable LOCKDOWN_OPTIONS must be JSON', err);
    throw err;
  }
  if (typeof options !== 'object' || Array.isArray(options)) {
    const err = new TypeError(
      'Environment variable LOCKDOWN_OPTIONS must be a JSON object',
    );
    console.error('', err, options);
    throw err;
  }
  lockdown(options);
} else {
  lockdown({
    // The default `{errorTaming: 'safe'}` setting, if possible, redacts the
    // stack trace info from the error instances, so that it is not available
    // merely by saying `errorInstance.stack`. However, some tools
    // will look for the stack there and become much less useful if it is
    // missing. In production, the settings in this file need to preserve
    // security, so the 'unsafe' setting below MUST always be commented out
    // except during private development.
    //
    // NOTE TO REVIEWERS: If you see the following line *not* commented out,
    // this may be a development accident that MUST be fixed before merging.
    //
    // errorTaming: 'unsafe',
    //
    //
    // The default `{stackFiltering: 'concise'}` setting usually makes for a
    // better debugging experience, by severely reducing the noisy distractions
    // of the normal verbose stack traces. Which is why we comment
    // out the `'verbose'` setting is commented out below. However, some
    // tools look for the full filename that it expects in order
    // to fetch the source text for diagnostics,
    //
    // Another reason for not commenting it out: The cause
    // of the bug may be anywhere, so the `'noise'` thrown out by the default
    // `'concise'` setting may also contain the signal you need. To see it,
    // uncomment out the following line. But please do not commit it in that
    // state.
    //
    // NOTE TO REVIEWERS: If you see the following line *not* commented out,
    // this may be a development accident that MUST be fixed before merging.
    //
    // stackFiltering: 'verbose',
    //
    //
    // The default `{overrideTaming: 'moderate'}` setting does not hurt the
    // debugging experience much. But it will introduce noise into, for example,
    // the vscode debugger's object inspector. During debug and test, if you can
    // avoid legacy code that needs the `'moderate'` setting, then the `'min'`
    // setting reduces debugging noise yet further, by turning fewer inherited
    // properties into accessors.
    //
    // NOTE TO REVIEWERS: If you see the following line *not* commented out,
    // this may be a development accident that MUST be fixed before merging.
    //
    // overrideTaming: 'min',
    //
    //
    // The default `{consoleTaming: 'safe'}` setting usually makes for a
    // better debugging experience, by wrapping the original `console` with
    // the SES replacement `console` that provides more information about
    // errors, expecially those thrown by the `assert` system. However,
    // in case the SES `console` is getting in the way, we provide the
    // `'unsafe'` option for leaving the original `console` in place.
    //
    // NOTE TO REVIEWERS: If you see the following line *not* commented out,
    // this may be a development accident that MUST be fixed before merging.
    //
    // consoleTaming: 'unsafe',
  });
}

// We are now in the "Start Compartment". Our global has all the same
// powerful things it had before, but the primordials have changed to make
// them safe to use in the arguments of API calls we make into more limited
// compartments

// 'Compartment' and 'harden' (and `StaticModuleRecord`) are now present in
// our global scope.

// Even on non-v8, we tame the start compartment's Error constructor so
// this assignment is not rejected, even if it does nothing.
Error.stackTraceLimit = Infinity;

harden(TextEncoder);
harden(TextDecoder);
