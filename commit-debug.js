// commit-debug.js - debug version of commit.js

// This is like `@agoric/install-ses` but sacrificing safety to optimize
// for debugging and testing. The difference is only the lockdown options.
// The setting below are *unsafe* and should not be used in contact with
// genuinely malicious code.

// See
// https://github.com/endojs/endo/blob/master/packages/ses/lockdown-options.md
// for more explanation of these lockdown options.

export * from './pre.js';

lockdown({
  // The default `{errorTaming: 'safe'}` setting, if possible, redacts the
  // stack trace info from the error instances, so that it is not available
  // merely by saying `errorInstance.stack`. However, some tools, such as
  // Ava, will look for the stack there and become much less useful if it is
  // missing.
  //
  // NOTE TO REVIEWERS: If you see the following line commented out,
  // this may be a development accident that should be fixed before merging.
  //
  errorTaming: 'unsafe',

  // The default `{stackFiltering: 'concise'}` setting usually makes for a
  // better debugging experience, by severely reducing the noisy distractions
  // of the normal verbose stack traces. Which is why you may want to comment
  // out the `'verbose'` setting is commented out below. However, some
  // tools, such as Ava, look for the full filename that it expects in order
  // to fetch the source text for diagnostics, which is why this file
  // sets it to `'verbose'`.
  //
  // Another reason for not commenting it out: The cause
  // of the bug may be anywhere, so the `'noise'` thrown out by the default
  // `'concise'` setting may also contain the signal you need. To see it,
  // uncomment out the following line. But please do not commit it in that
  // state.
  //
  // NOTE TO REVIEWERS: If you see the following line commented out,
  // this may be a development accident that should be fixed before merging.
  //
  stackFiltering: 'verbose',

  // The default `{overrideTaming: 'moderate'}` setting does not hurt the
  // debugging experience much. But it will introduce noise into, for example,
  // the vscode debugger's object inspector. During debug and test, if you can
  // avoid legacy code that needs the `'moderate'` setting, then the `'min'`
  // setting reduces debugging noise yet further, by turning fewer inherited
  // properties into accessors.
  //
  // NOTE TO REVIEWERS: If you see the following line commented out,
  // this may be a development accident that should be fixed before merging.
  //
  overrideTaming: 'min',

  // The default `{consoleTaming: 'safe'}` setting usually makes for a
  // better debugging experience, by wrapping the original `console` with
  // the SES replacement `console` that provides more information about
  // errors, expecially those thrown by the `assert` system. However,
  // in case the SES `console` is getting in the way, we provide the
  // `'unsafe'` option for leaving the original `console` in place.
  //
  // NOTE TO REVIEWERS: If you see the following line *not* commented out,
  // this may be a development accident that should be fixed before merging.
  //
  // consoleTaming: 'unsafe',
});
