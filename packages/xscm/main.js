/* global trace */

// eslint-disable-next-line import/no-unresolved
import { File } from "file";

import { harden } from "./src/harden";
import { makeConsole } from "./src/console";
// TODO: import { loadMain } from "./src/endo-load";
import xscm from "./src/xscm";

globalThis.console = harden(makeConsole(trace));

export default async function main(argv) {
  trace(`argv.length: ${argv.length}\n`);

  const f = new File(argv[0]);
  const contents = f.read(String);
  trace(`file ${f} contains ${contents}\n`);

  xscm(argv);
}
