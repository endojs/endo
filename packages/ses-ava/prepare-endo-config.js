// This module is a variation on "@ses-ava/prepare-endo.js" that
// is suitable for use in an AVA config's "require" array.
// AVA config modules are expected to either *not* export a `default`,
// or to export a test if they do.
// The default export of "@ses-ava/prepare-endo" is the `test` function, so
// this indirection exists solely to mask out the default export.
import './prepare-endo.js';
