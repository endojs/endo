// Verifies the drag-and-drop confinement barrier (see setup-preact-container.js
// and the renderer's makeSafeDataTransfer):
//  - a drag handler in a SANITIZED (renderConfined) tree receives a string-only
//    SafeDataTransfer: getData/setData/types/dropEffect/effectAllowed work...
//  - ...but `.files`, `.items`, and `webkitGetAsEntry` (filesystem-read
//    capabilities) are NOT present — never the real DataTransfer.
// This is the safe alternative to a trusted-exit/passthrough renderer.
// Runs under the app's severe lockdown.

import '../../pre-lockdown.js';
import '@endo/init';

import { h, renderConfined } from '../../setup-preact-container.js';

const results = [];
const check = (name, cond, detail = '') =>
  results.push({ name, pass: !!cond, detail: String(detail) });

const fireDrag = (target, type, dataTransfer) =>
  target.dispatchEvent(
    new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
  );

(async () => {
  try {
    let evt = null;
    let dropEffectReadBack;
    const App = () =>
      h('div', {
        id: 'drop',
        onDragOver: e => {
          // Mirror the inventory's real usage. Setting dropEffect must not
          // throw and the accessor must read back a string (the platform may
          // normalize the value on a synthetic event, so we don't assert the
          // exact value here — setData/getData below proves write-through).
          e.dataTransfer.dropEffect = 'copy';
          evt = e;
          dropEffectReadBack = e.dataTransfer.dropEffect;
        },
      });
    const el = document.createElement('div');
    document.body.appendChild(el);
    renderConfined(h(App), el);

    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    dt.setData('application/x-endo-petname', '["a","b"]');
    fireDrag(el.querySelector('#drop'), 'dragover', dt);

    check('handler invoked', !!evt);
    const sdt = evt && evt.dataTransfer;
    check('SafeDataTransfer present (not undefined)', sdt != null);

    // String operations work.
    check(
      'getData returns the string',
      sdt && sdt.getData('text/plain') === 'hello',
    );
    check(
      'types is an includes-able string array',
      sdt &&
        Array.isArray(sdt.types) &&
        sdt.types.includes('application/x-endo-petname'),
    );
    // dropEffect accessor delegates (set did not throw; get returns a string).
    check(
      'dropEffect accessor delegates',
      typeof dropEffectReadBack === 'string',
    );
    let setDataWorked = false;
    try {
      sdt.setData('text/x-test', 'v');
      setDataWorked = dt.getData('text/x-test') === 'v';
    } catch (e) {
      setDataWorked = false;
    }
    check('setData writes through to real DataTransfer', setDataWorked);

    // Capabilities that must NOT leak.
    check('no .files (no File capability)', sdt && sdt.files === undefined);
    check('no .items (no DataTransferItem)', sdt && sdt.items === undefined);
    check(
      'no webkitGetAsEntry (no FileSystemEntry)',
      sdt && sdt.webkitGetAsEntry === undefined,
    );
    check(
      'no setDragImage (no DOM-node sink)',
      sdt && sdt.setDragImage === undefined,
    );
    // It is not the real DataTransfer instance.
    check(
      'facade is not the real DataTransfer',
      sdt && sdt !== dt && !(sdt instanceof DataTransfer),
    );
    // And it is frozen.
    check('facade is frozen', sdt && Object.isFrozen(sdt));

    globalThis.__results = results;
  } catch (e) {
    globalThis.__results = [
      {
        name: 'probe threw',
        pass: false,
        detail: `${e.name}: ${e.message}\n${e.stack}`,
      },
    ];
  } finally {
    globalThis.__done = true;
  }
})();
