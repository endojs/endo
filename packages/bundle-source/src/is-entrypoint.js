// Detect if this is run as a script.
import url from 'url';
import process from 'process';
import fs from 'fs';

// FIXME: Should maybe be exported by '@endo/something'?
export const isEntrypoint = href =>
  String(href) ===
  url.pathToFileURL(fs.realpathSync(process.argv[1]) ?? '/').href;
