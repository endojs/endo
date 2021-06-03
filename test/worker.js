import '@agoric/install-ses';

import { parentPort } from 'worker_threads';
import { makeGuest, makeHost } from './traplib';

let dispatch;
parentPort.addListener('message', obj => {
  switch (obj.type) {
    case 'TEST_INIT': {
      const { sab, isGuest } = obj;
      const initFn = isGuest ? makeGuest : makeHost;
      const ret = initFn(o => parentPort.postMessage(o), sab);
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
