

// test hooking marshalling in captp
import '@endo/init'
import { E, Far } from "@endo/captp";
import { makeCaptpPair } from "./util.js";

const leftOpts = {
  exportHook (val, slot) {
    console.log('left exportHook', val, slot)
  },
  importHook (val, slot) {
    console.log('left importHook', val, slot)
  }
}
const rightOpts = {
  exportHook (val, slot) {
    console.log('right exportHook', val, slot)
  },
  importHook (val, slot) {
    console.log('right importHook', val, slot)
  }
}
const { makeLeft, makeRight } = makeCaptpPair(leftOpts, rightOpts);

const { getBootstrap: getRight } = makeLeft('left', Far('left', {}));
makeRight('right', Far('right', {
  ping() {
    return Far('tester', {test () { return 'test' } });
  }
}));

E(getRight()).ping().then(console.log)