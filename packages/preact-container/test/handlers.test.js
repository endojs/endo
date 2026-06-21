import { h } from 'preact';
import { useState } from 'preact/hooks';
import { setupRerender } from 'preact/test-utils';
import { renderConfined, unmount } from '../src/renderer.js';
import { setupScratch, teardown } from './_util/helpers.js';

/**
 * Smoke tests for the everyday event-handler patterns component code
 * relies on. The SafeEvent facade has to expose enough fields that
 * controlled inputs, dropdowns, checkboxes, radios, textareas, form
 * submission, and keyboard input all keep working without ever
 * letting the handler reach into the live DOM.
 */

function fire(node, type, init) {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

describe('preact/secure: common event handlers', () => {
  /** @type {HTMLDivElement} */
  let scratch;
  /** @type {() => void} */
  let rerender;

  beforeEach(() => {
    scratch = setupScratch();
    rerender = setupRerender();
  });

  afterEach(() => {
    unmount(scratch);
    teardown(scratch);
  });

  it('controlled text input reads e.target.value', () => {
    const seen = [];
    function Form() {
      const [name, setName] = useState('');
      return h('input', {
        type: 'text',
        value: name,

        onInput: e => {
          seen.push(e.target.value);
          setName(e.target.value);
        },
      });
    }
    renderConfined(h(Form, null), scratch);
    const input = scratch.querySelector('input');

    input.value = 'a';
    fire(input, 'input');
    rerender();
    expect(input.value).to.equal('a');

    input.value = 'ab';
    fire(input, 'input');
    rerender();
    expect(input.value).to.equal('ab');

    expect(seen).to.deep.equal(['a', 'ab']);
  });

  it('checkbox toggle reads e.target.checked', () => {
    let lastChecked;
    function Toggle() {
      const [on, setOn] = useState(false);
      return h(
        'label',
        null,
        h('input', {
          type: 'checkbox',
          checked: on,

          onChange: e => {
            lastChecked = e.target.checked;
            setOn(e.target.checked);
          },
        }),
        on ? 'on' : 'off',
      );
    }
    renderConfined(h(Toggle, null), scratch);
    const cb = scratch.querySelector('input');

    cb.checked = true;
    fire(cb, 'change');
    rerender();
    expect(lastChecked).to.equal(true);
    expect(scratch.querySelector('label').textContent).to.contain('on');

    cb.checked = false;
    fire(cb, 'change');
    rerender();
    expect(lastChecked).to.equal(false);
    expect(scratch.querySelector('label').textContent).to.contain('off');
  });

  it('radio group reports the selected value via e.target.value', () => {
    const picks = [];
    function Group() {
      const [color, setColor] = useState('red');
      const onPick = e => {
        picks.push(e.target.value);
        setColor(e.target.value);
      };
      return h(
        'form',
        null,
        h(
          'label',
          null,
          h('input', {
            type: 'radio',
            name: 'color',
            value: 'red',
            checked: color === 'red',
            onChange: onPick,
          }),
          'red',
        ),
        h(
          'label',
          null,
          h('input', {
            type: 'radio',
            name: 'color',
            value: 'green',
            checked: color === 'green',
            onChange: onPick,
          }),
          'green',
        ),
        h(
          'label',
          null,
          h('input', {
            type: 'radio',
            name: 'color',
            value: 'blue',
            checked: color === 'blue',
            onChange: onPick,
          }),
          'blue',
        ),
      );
    }
    renderConfined(h(Group, null), scratch);
    const inputs = scratch.querySelectorAll('input[type=radio]');
    inputs[1].checked = true;
    fire(inputs[1], 'change');
    rerender();
    inputs[2].checked = true;
    fire(inputs[2], 'change');
    rerender();
    expect(picks).to.deep.equal(['green', 'blue']);
  });

  it('native <select> dropdown reports e.target.value and selectedIndex', () => {
    let lastValue;
    let lastIndex;
    function Picker() {
      const [v, setV] = useState('a');
      return h(
        'select',
        {
          value: v,

          onChange: e => {
            lastValue = e.target.value;
            lastIndex = e.target.selectedIndex;
            setV(e.target.value);
          },
        },
        h(
          'option',
          {
            value: 'a',
          },
          'A',
        ),
        h(
          'option',
          {
            value: 'b',
          },
          'B',
        ),
        h(
          'option',
          {
            value: 'c',
          },
          'C',
        ),
      );
    }
    renderConfined(h(Picker, null), scratch);
    const select = scratch.querySelector('select');

    select.value = 'c';
    fire(select, 'change');
    rerender();
    expect(lastValue).to.equal('c');
    expect(lastIndex).to.equal(2);
    expect(select.value).to.equal('c');
  });

  it('textarea reads e.target.value', () => {
    let last;
    function Notes() {
      const [text, setText] = useState('');
      return h('textarea', {
        value: text,

        onInput: e => {
          last = e.target.value;
          setText(e.target.value);
        },
      });
    }
    renderConfined(h(Notes, null), scratch);
    const ta = scratch.querySelector('textarea');
    ta.value = 'hello world';
    fire(ta, 'input');
    rerender();
    expect(last).to.equal('hello world');
    expect(ta.value).to.equal('hello world');
  });

  it('keyboard handlers see e.key, e.code, and modifier flags', () => {
    const events = [];
    function KeyBox() {
      return h('input', {
        type: 'text',

        onKeyDown: e => {
          events.push({
            key: e.key,
            code: e.code,
            shift: e.shiftKey,
            ctrl: e.ctrlKey,
            alt: e.altKey,
            meta: e.metaKey,
          });
        },
      });
    }
    renderConfined(h(KeyBox, null), scratch);
    const input = scratch.querySelector('input');

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'A',
        code: 'KeyA',
        shiftKey: true,
        ctrlKey: true,
      }),
    );

    expect(events).to.deep.equal([
      {
        key: 'Enter',
        code: 'Enter',
        shift: false,
        ctrl: false,
        alt: false,
        meta: false,
      },
      {
        key: 'A',
        code: 'KeyA',
        shift: true,
        ctrl: true,
        alt: false,
        meta: false,
      },
    ]);
  });

  it('form submit handler can call preventDefault and read inputs from state', () => {
    let submittedAs;
    function NameForm() {
      const [name, setName] = useState('');
      const onSubmit = e => {
        e.preventDefault();
        submittedAs = name;
      };
      return h(
        'form',
        {
          onSubmit,
        },
        h('input', {
          type: 'text',
          value: name,
          onInput: e => setName(e.target.value),
        }),
        h(
          'button',
          {
            type: 'submit',
          },
          'go',
        ),
      );
    }
    renderConfined(h(NameForm, null), scratch);
    const input = scratch.querySelector('input');
    input.value = 'Ada';
    fire(input, 'input');
    rerender();

    const submitEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    scratch.querySelector('form').dispatchEvent(submitEvent);

    expect(submittedAs).to.equal('Ada');
    expect(submitEvent.defaultPrevented).to.equal(true);
  });

  it('button click handler can update state and re-renders the tree', () => {
    function Counter() {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => {
            setN(prev => prev + 1);
          },
        },
        n,
      );
    }
    renderConfined(h(Counter, null), scratch);
    const btn = scratch.querySelector('button');
    expect(btn.textContent).to.equal('0');
    btn.click();
    rerender();
    expect(btn.textContent).to.equal('1');
    btn.click();
    btn.click();
    rerender();
    expect(btn.textContent).to.equal('3');
  });

  it('mouse events expose coordinates and button without the DOM', () => {
    let last;
    function Surface() {
      return h(
        'div',
        {
          onClick: e => {
            last = {
              x: e.clientX,
              y: e.clientY,
              button: e.button,
              hasTarget: e.target instanceof Element,
            };
          },
        },
        'hit me',
      );
    }
    renderConfined(h(Surface, null), scratch);
    scratch.querySelector('div').dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 42,
        clientY: 17,
        button: 0,
      }),
    );
    expect(last).to.deep.equal({
      x: 42,
      y: 17,
      button: 0,
      hasTarget: false,
    });
  });

  it('focus and blur events fire and report type', () => {
    const seen = [];
    function Field() {
      return h('input', {
        type: 'text',
        onFocus: e => seen.push(e.type),
        onBlur: e => seen.push(e.type),
      });
    }
    renderConfined(h(Field, null), scratch);
    const input = scratch.querySelector('input');
    fire(input, 'focus');
    fire(input, 'blur');
    expect(seen).to.deep.equal(['focus', 'blur']);
  });

  it('multiple handlers on the same element each receive their own SafeEvent', () => {
    const tags = [];
    function Box() {
      return h(
        'div',
        {
          onClick: e => tags.push(['outer', e.target.tagName]),
          onMouseDown: e => tags.push(['mousedown', e.type]),
        },
        h(
          'button',
          {
            onClick: e => tags.push(['inner', e.target.tagName]),
          },
          'x',
        ),
      );
    }
    renderConfined(h(Box, null), scratch);
    const btn = scratch.querySelector('button');
    fire(btn, 'mousedown');
    btn.click();
    // inner click bubbles up to the outer div's click handler
    expect(tags).to.deep.equal([
      ['mousedown', 'mousedown'],
      ['inner', 'button'],
      ['outer', 'button'],
    ]);
  });

  it('stopPropagation on a child handler keeps a parent handler from firing', () => {
    const seen = [];
    function App() {
      return h(
        'div',
        {
          onClick: () => seen.push('outer'),
        },
        h(
          'button',
          {
            onClick: e => {
              e.stopPropagation();
              seen.push('inner');
            },
          },
          'x',
        ),
      );
    }
    renderConfined(h(App, null), scratch);
    scratch.querySelector('button').click();
    expect(seen).to.deep.equal(['inner']);
  });

  it('onChange and onInput coexist on a single input without interfering', () => {
    const inputCalls = [];
    const changeCalls = [];
    function Field() {
      return h('input', {
        type: 'text',
        onInput: e => inputCalls.push(e.target.value),
        onChange: e => changeCalls.push(e.target.value),
      });
    }
    renderConfined(h(Field, null), scratch);
    const input = scratch.querySelector('input');

    input.value = 'h';
    fire(input, 'input');
    input.value = 'hi';
    fire(input, 'input');
    fire(input, 'change');

    expect(inputCalls).to.deep.equal(['h', 'hi']);
    expect(changeCalls).to.deep.equal(['hi']);
  });

  it('drag events expose a string-only SafeDataTransfer, never the real one', () => {
    let sdt;
    let readBack;
    function DropZone() {
      return h('div', {
        onDragOver: e => {
          e.dataTransfer.dropEffect = 'copy';
          sdt = e.dataTransfer;
          readBack = e.dataTransfer.getData('text/plain');
        },
      });
    }
    renderConfined(h(DropZone, null), scratch);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    dt.setData('application/x-endo-petname', '["a","b"]');
    scratch.querySelector('div').dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );

    // String operations the app relies on work.
    expect(readBack).to.equal('hello');
    expect(Array.isArray(sdt.types)).to.equal(true);
    expect(sdt.types.includes('application/x-endo-petname')).to.equal(true);
    sdt.setData('text/x-test', 'v');
    expect(dt.getData('text/x-test')).to.equal('v');

    // Capabilities that must never leak to a confined handler:
    // `.files` / `.items[].webkitGetAsEntry()` are filesystem-read, and
    // `setDragImage` is a real-DOM-node sink.
    expect(sdt.files).to.equal(undefined);
    expect(sdt.items).to.equal(undefined);
    expect(sdt.webkitGetAsEntry).to.equal(undefined);
    expect(sdt.setDragImage).to.equal(undefined);

    // It is a frozen facade, not the live DataTransfer.
    expect(sdt instanceof DataTransfer).to.equal(false);
    expect(sdt).to.not.equal(dt);
    expect(Object.isFrozen(sdt)).to.equal(true);
  });
});
