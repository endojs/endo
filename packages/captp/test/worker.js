/// <reference types="ses"/>

import '@endo/init/pre-remoting.js';
import '@endo/init/debug.js';

import { parentPort } from 'worker_threads';
import { Fail } from '@endo/errors';
import { makeGuest, makeHost } from './traplib.js';

let dispatch;
parentPort.addListener('message', obj => {
  switch (obj.type) {
    case 'TEST_INIT': {
      !dispatch || Fail`Internal error; duplicate initialization`;
      const { transferBuffer, isGuest } = obj;
      const initFn = isGuest ? makeGuest : makeHost;
      const ret = initFn(o => parentPort.postMessage(o), transferBuffer);
      dispatch = ret.dispatch;
      break;
    }
    default: {
      if (dispatch) {
        dispatch(obj);
      }
      break;
    }
  }
});
