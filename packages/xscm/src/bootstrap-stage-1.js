/* global trace */

// eslint-disable-next-line import/no-unresolved
import { TextEncoder, TextDecoder } from "text";
import { File } from "file";
import { pwd } from './pwd';
import Resource from 'Resource';

const hostBuffer = new Resource('bootstrap-stage-2.js');
// trace('host buffer ', hostBuffer.byteLength, '\n');
const arrayBuffer = hostBuffer.slice(0);
// trace('array buffer ', arrayBuffer.byteLength, '\n');
const uint8Array = new Uint8Array(arrayBuffer);
// trace('uint8array ', uint8Array.length, '\n');
const source = new TextDecoder().decode(uint8Array);
// trace('string ', source.length, '\n');

export default async function main() {
  const url = `file:///${pwd}/demoapp/main.js`;
  const globals = {
    url,
    trace,
    File,
    TextEncoder,
    TextDecoder
  };
  const compartment = new Compartment(globals);
  // trace(source);
  compartment.evaluate(source);
}
