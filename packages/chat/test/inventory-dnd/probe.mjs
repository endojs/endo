// Browser fixture: drive synthetic HTML5 drag-and-drop against the extracted
// inventory dnd factories (makeItemDragDrop, makeChannelReorder) and record
// pass/fail on globalThis for the Playwright runner. A real DataTransfer +
// real layout means this exercises the actual behavior, not a mock of it.
//
// Locks down exactly as the app does (pre-lockdown.js selects
// overrideTaming: 'severe'; @endo/init runs lockdown and installs both harden
// and the HandledPromise the drop menu's E(rootPowers).copy/move need). This
// also renders the DropMenu Preact component under the same severe taming as
// production — the level Preact's `component.constructor = type` requires.
import '../../pre-lockdown.js';
import '@endo/init';

import { makeChannelReorder, makeItemDragDrop } from '../../inventory/dnd.js';

const PETNAME_MIME = 'application/x-endo-petname';

/** @type {{ name: string, pass: boolean, detail: string }[]} */
const results = [];
const check = (name, cond, detail = '') =>
  results.push({ name, pass: !!cond, detail: String(detail) });

const fireDrag = (
  type,
  target,
  { dataTransfer, clientX = 0, clientY = 0 } = {},
) => {
  const e = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    dataTransfer,
  });
  target.dispatchEvent(e);
  return e;
};

const tick = () => new Promise(resolve => setTimeout(resolve, 30));

(async () => {
  try {
    // ---------------- makeItemDragDrop ----------------
    /** @type {Array<[string, string[], string[]]>} */
    const powerCalls = [];
    const rootPowers = {
      copy: (from, to) => {
        powerCalls.push(['copy', from, to]);
        return Promise.resolve();
      },
      move: (from, to) => {
        powerCalls.push(['move', from, to]);
        return Promise.resolve();
      },
    };
    const itemDnd = makeItemDragDrop({ rootPowers });

    // Drag source
    const src = document.createElement('div');
    document.body.appendChild(src);
    itemDnd.attachDragSource(src, ['dir', 'file']);
    check('source becomes draggable', src.draggable === true);

    const dt = new DataTransfer();
    fireDrag('dragstart', src, { dataTransfer: dt });
    check('dragstart adds dragging class', src.classList.contains('dragging'));
    check(
      'dragstart writes petname payload',
      dt.getData(PETNAME_MIME) === JSON.stringify(['dir', 'file']),
      dt.getData(PETNAME_MIME),
    );

    // Hub row accepts the drop
    const hub = document.createElement('div');
    document.body.appendChild(hub);
    itemDnd.attachRowDropTarget(hub, {
      absPath: ['dir2'],
      acceptsDrop: () => true,
    });
    const over = fireDrag('dragover', hub, { dataTransfer: dt });
    check(
      'hub dragover adds drop-target',
      hub.classList.contains('drop-target'),
    );
    check('hub dragover preventDefault', over.defaultPrevented);

    fireDrag('drop', hub, { dataTransfer: dt, clientX: 5, clientY: 5 });
    const menu = document.querySelector('.inventory-drop-menu');
    check('hub drop shows link/move menu', !!menu);
    const labels = menu
      ? [...menu.querySelectorAll('.inventory-drop-menu-item')].map(
          b => b.textContent,
        )
      : [];
    check(
      'menu offers Link here and Move here',
      labels.includes('Link here') && labels.includes('Move here'),
      labels.join(','),
    );

    // Clicking "Move here" relinks via rootPowers.move(source, target).
    const moveBtn = menu
      ? [...menu.querySelectorAll('button')].find(
          b => b.textContent === 'Move here',
        )
      : null;
    if (moveBtn) moveBtn.click();
    await tick();
    check(
      'Move here calls rootPowers.move(source, target)',
      powerCalls.some(
        ([op, from, to]) =>
          op === 'move' &&
          JSON.stringify(from) === JSON.stringify(['dir', 'file']) &&
          JSON.stringify(to) === JSON.stringify(['dir2', 'file']),
      ),
      JSON.stringify(powerCalls),
    );

    // Non-hub row rejects: acceptsDrop() === false
    const leaf = document.createElement('div');
    document.body.appendChild(leaf);
    itemDnd.attachRowDropTarget(leaf, {
      absPath: ['dir3'],
      acceptsDrop: () => false,
    });
    const dt2 = new DataTransfer();
    dt2.setData(PETNAME_MIME, JSON.stringify(['dir', 'file']));
    fireDrag('dragover', leaf, { dataTransfer: dt2 });
    check(
      'non-hub dragover: no drop-target',
      !leaf.classList.contains('drop-target'),
    );
    const before = document.querySelectorAll('.inventory-drop-menu').length;
    fireDrag('drop', leaf, { dataTransfer: dt2, clientX: 5, clientY: 5 });
    check(
      'non-hub drop: no new menu',
      document.querySelectorAll('.inventory-drop-menu').length === before,
    );

    // ---------------- makeChannelReorder ----------------
    document.querySelectorAll('.inventory-drop-menu').forEach(m => m.remove());
    const channelReorder = makeChannelReorder();
    const list = document.createElement('div');
    document.body.appendChild(list);

    const mkChannel = name => {
      const wrap = document.createElement('div');
      wrap.className = 'channel-item';
      wrap.dataset.name = name;
      wrap.style.display = 'block';
      wrap.style.height = '30px';
      const row = document.createElement('div');
      row.style.height = '30px';
      wrap.appendChild(row);
      list.appendChild(wrap);
      channelReorder.attachDragSource(row, wrap, name);
      return { wrap, row };
    };

    const alpha = mkChannel('alpha');
    const beta = mkChannel('beta');

    let reordered = null;
    channelReorder.attachReorderZone(list, {
      onReorder: order => {
        reordered = order;
      },
    });
    check('channel row becomes draggable', beta.row.draggable === true);
    check(
      'reorder zone sets list position relative',
      list.style.position === 'relative',
    );

    const dt3 = new DataTransfer();
    fireDrag('dragstart', beta.row, { dataTransfer: dt3 });
    check(
      'channel dragstart adds channel-dragging',
      beta.wrap.classList.contains('channel-dragging'),
    );

    fireDrag('dragover', list, { dataTransfer: dt3, clientY: 1 });
    check(
      'channel dragover creates drop indicator',
      !!list.querySelector('.channel-drop-indicator'),
    );

    // Drop above alpha's midpoint -> insert beta before alpha.
    const aRect = alpha.wrap.getBoundingClientRect();
    fireDrag('drop', list, { dataTransfer: dt3, clientY: aRect.top + 1 });
    const order = [...list.querySelectorAll('.channel-item')].map(
      el => el.dataset.name,
    );
    check(
      'drop reorders beta before alpha',
      order.join(',') === 'beta,alpha',
      order.join(','),
    );
    check(
      'onReorder reports new order',
      reordered && reordered.join(',') === 'beta,alpha',
      JSON.stringify(reordered),
    );
    check(
      'drop clears the indicator',
      !list.querySelector('.channel-drop-indicator'),
    );

    globalThis.__dndResults = results;
  } catch (e) {
    globalThis.__dndResults = [
      {
        name: 'probe threw',
        pass: false,
        detail: `${e.name}: ${e.message}\n${e.stack}`,
      },
    ];
  } finally {
    globalThis.__dndDone = true;
  }
})();
