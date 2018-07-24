# SES Demo

This directory contains a brief online demonstration of how SES enables safe
interaction between mutually suspicious code. Visit
https://rawgit.com/Agoric/SES/master/demo/ to run it.

For local testing, run a web server and serve the entire git tree (the demo
accesses the generated `ROOT/dist/ses-shim.js` file, so serving just this
`demo/` directory is not enough). Re-run `npm run-script build` after any
changes to the source code to rebuild `ses-shim.js`.
