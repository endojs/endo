/* global lockdown */

// This is a CommonJS module, to be used like `node -r endo/src/lockdown.cjs`.
// The `endo exec` command stages a man-in-the-middle `node` shell script that
// in turn injects this SES lockdown parameter in all Node.js commands in the
// resulting shell environment.
// The taming behavior may be overridden with environment variables
// like `ERROR_TAMING=unsafe endo exec node ...`

require("ses");
lockdown({
  dateTaming: process.env.ENDO_DATE_TAMING || 'safe',
  errorTaming: process.env.ENDO_ERROR_TAMING || 'safe',
  mathTaming: process.env.ENDO_MATH_TAMING || 'safe',
  regExpTaming: process.env.ENDO_REGEXP_TAMING || 'safe',
  localeTaming: process.env.ENDO_LOCAlE_TAMING || 'safe',
});
