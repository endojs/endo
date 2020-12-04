/* global trace */

import { harden } from "./src/harden";
import { makeConsole } from "./src/console";
// TODO: import { loadMain } from "./src/endo-load";
import xscm from "./src/xscm";

globalThis.console = harden(makeConsole(trace));

export default async function main() {
  xscm();
}
