/* global trace */

// eslint-disable-next-line import/no-unresolved
import "./src/text-shim";
import URL from "@agoric/compartment-mapper/node-url";
import { File } from "file";
import { harden } from "./src/harden";
import { makeConsole } from "./src/console";
import { importLocation } from "@agoric/compartment-mapper/main";

globalThis.console = harden(makeConsole(trace));

const read = async url => {
  const path = new URL(url).pathname;
  const file = new File(path);
  const buffer = file.read(ArrayBuffer);
  const bytes = new Uint8Array(buffer);
  return bytes;
};

export default async function main() {
  trace('loading...\n');
  const app = await importLocation(read, "file:///Users/kris/ses/packages/xscm/demoapp/main.js");
  trace(app);
  trace(await app.import("./entry.js"));
}
