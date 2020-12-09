/* global trace */

// eslint-disable-next-line import/no-unresolved
import "./src/text-shim";
import { File } from "file";
import { harden } from "./src/harden";
import { makeConsole } from "./src/console";
import { importLocation } from "@agoric/compartment-mapper/main";

// TODO: import { loadMain } from "./src/endo-load";
import xscm from "./src/xscm";

globalThis.console = harden(makeConsole(trace));

export default async function main() {
  const f = new File("/Users/kris/ses/packages/xscm/main.js");
  const contents = f.read(String);
  trace(`file ${f} contains ${contents}\n`);
}
