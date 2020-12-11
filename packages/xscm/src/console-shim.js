import { makeConsole } from "./console.js";
globalThis.console = makeConsole(trace);
