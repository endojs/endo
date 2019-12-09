/* global window, document, SES */
/* eslint-disable no-plusplus, no-use-before-define */
console.log('starting');

function start() {
  'use strict';

  // First we prepare endowments for the defender code. In a normal
  // application we should not allow confined code to access these "Primal
  // Realm" objects, since their ".prototype.constructor" property is the
  // full-powered Function evaluator, with which it could break confinement.
  // For this demo, we're not defending against the defender, but we want to
  // give it enough power to be interesting.

  function getRandomValues(array) {
    window.crypto.getRandomValues(array);
  }

  // https://www.dafont.com/hyperspace.font
  const macguffin = document.getElementById('macguffin');
  function setMacguffinText(text) {
    macguffin.textContent = text;
  }

  function delayMS(count) {
    // busywait for 'count' milliseconds
    const target = Date.now() + count;
    // eslint-disable-next-line no-empty
    while (Date.now() < target) {}
  }

  function refreshUI() {
    return new Promise((resolve, _reject) =>
      window.setTimeout(resolve, 0, undefined),
    );
  }

  const attackerGuess = document.getElementById('guess');
  function setAttackerGuess(text) {
    attackerGuess.textContent = text;
  }

  function setLaunch(status) {
    if (status) {
      document.getElementById('guess-box').className = 'code-box launched';
    } else {
      document.getElementById('guess-box').className = 'code-box';
    }
  }

  // two approaches:
  // * force in-order delivery:
  //   maintain queue of (delay, resolver) pairs
  //   when guess() is called: compute delay, build promise, append (delay,resolver)
  //     - if queue was empty, call setTimeout(queue[0].delay)
  //     - then return promise
  //   when setTimeout fires: pop queue, fire resolver on next turn
  //     - if queue is non-empty, start new timer for queue[0].delay
  // * better: don't give UI queue access to attacker
  //   attacker provides stateful object with go() method
  //   framework calls go(guess_func)
  //   attacker can use Promises and call guess_func(guess)
  //   guess_func returns synchronously (after busywait)
  //   limit attacker to some finite number of calls per go()
  //   framework updates UI (with setTimeout(0)), then calls go() again

  // build the SES Realm and evaluate the defender inside
  const options = {};
  document.getElementById('dateNowStatus').textContent =
    'Date.now() returns NaN';
  if (window.location.search.indexOf('dateNow=enabled') !== -1) {
    document.getElementById('dateNowStatus').textContent = 'Date.now() enabled';
    options.dateNowMode = 'allow';
  }
  options.consoleMode = 'allow';
  const r = SES.makeSESRootRealm(options);
  const defenderSrc = buildDefenderSrc();
  const d = r.evaluate(defenderSrc, {
    getRandomValues,
    setMacguffinText,
    delayMS,
    refreshUI,
    setAttackerGuess,
    setLaunch,
    require: r.makeRequire({ '@agoric/harden': true }),
  });

  // now create the form that lets the user submit attacker code
  const ap = document.getElementById('attacker-program');
  const aExecute = document.getElementById('attacker-submit');
  const aStop = document.getElementById('attacker-stop');
  aExecute.addEventListener('click', _event => {
    console.log('click');
    const code = ap.value;
    console.log('executing attacker code:', code);
    d.stopAttacker();
    // wait a moment to make sure the running program notices the stop request
    const wait = new Promise((resolve, _reject) =>
      window.setTimeout(resolve, 10, undefined),
    );
    wait.then(() => d.submitProgram(code));
  });
  aStop.addEventListener('click', _event => {
    console.log('stop');
    console.log('asking attacker code to stop');
    d.stopAttacker();
  });

  // provide some sample attacks
  function setSampleBody(code) {
    code = code.replace(/^function .* {/, '');
    code = code.replace(/}$/, '');
    ap.value = code;
  }

  const { allZeros, counter, timing } = sampleAttacks();

  document.getElementById('sample-0').addEventListener('click', () => {
    setSampleBody(`${allZeros}`);
  });

  document.getElementById('sample-counter').addEventListener('click', () => {
    setSampleBody(`${counter}`);
  });

  document.getElementById('sample-timing').addEventListener('click', () => {
    setSampleBody(`${timing}`);
  });
}

function sampleAttacks() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let guess;

  function allZeros() {
    // eslint-disable-next-line no-shadow, no-unused-vars, require-yield
    function* allZeros() {
      guess('0000000000');
    }
  }

  function counter() {
    // eslint-disable-next-line no-shadow, no-unused-vars, require-yield
    function* counter() {
      for (let i = 0; true; i++) {
        let guessedCode = i.toString(36).toUpperCase();
        while (guessedCode.length < 10) {
          guessedCode = `0${guessedCode}`;
        }
        guess(guessedCode);
        yield;
      }
    }
  }

  function timing() {
    // eslint-disable-next-line no-shadow, no-unused-vars, require-yield
    function* timing() {
      function toChar(c) {
        return c.toString(36).toUpperCase();
      }

      function fastestChar(delays) {
        const pairs = Array.from(delays.entries());
        pairs.sort((a, b) => b[1] - a[1]);
        return pairs[0][0];
      }

      function insert(into, offset, char) {
        return (
          into.slice(0, offset) + char + into.slice(offset + 1, into.length)
        );
      }

      function buildCode(base, offset, c) {
        // keep the first 'offset' chars of base, set [offset] to c, fill the
        // rest with random-looking junk to make the demo look cool
        // (random-looking, not truly random, because we're deterministic)
        let code = insert(base, offset, toChar(c));
        for (let off2 = offset + 1; off2 < 10; off2++) {
          code = insert(code, off2, toChar((off2 * 3 + c * 7) % 36));
        }
        return code;
      }

      let base = '0000000000';
      while (true) {
        for (let offset = 0; offset < 10; offset++) {
          const delays = new Map();
          for (let c = 0; c < 36; c++) {
            const guessedCode = buildCode(base, offset, c);
            // eslint-disable-next-line no-shadow
            const start = Date.now();
            guess(guessedCode);
            const elapsed = Date.now() - start;
            delays.set(toChar(c), elapsed);
            yield; // allow UI to refresh
            // if our guess was right, then on the last character
            // (offset===9) we never actually reach here, since we guessed
            // correctly earlier, and when the attacker guesses correctly,
            // the defender stops calling go()
          }
          console.log(delays);
          const nextChar = fastestChar(delays);
          base = insert(base, offset, nextChar);
          console.log(`Setting code[${offset}]=${nextChar} -> ${base}`);
        }
        console.log('we must have measured the timings wrong, try again');
      }
    }
  }

  return { allZeros, counter, timing };
}

function buildDefenderSrc() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let getRandomValues;
  let setMacguffinText;
  let delayMS;
  let setAttackerGuess;
  let setLaunch;
  let SES;
  let refreshUI;

  // this is stringified and loaded in the SES realm, with several endowments
  function defender() {
    setMacguffinText('defender go');
    // eslint-disable-next-line global-require
    const harden = require('@agoric/harden');

    function buildSecretCode() {
      const array = new Uint32Array(10);
      let secretCode = '';
      const SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      getRandomValues(array);
      for (let i = 0; i < 10; i++) {
        // we use Uint32Array, instead of Uint8Array, to reduce the bias
        // somewhat. Actual launch codes should use a 128-bit integer before
        // wrapping down to a single digit.
        //
        // Also please use don't use this for launch codes.
        const digit = array[i] % SYMBOLS.length;
        secretCode += SYMBOLS.slice(digit, digit + 1);
      }
      return secretCode;
    }

    const secretCode = buildSecretCode();
    setMacguffinText(secretCode);

    let enableAttacker = false;

    function guess(guessedCode) {
      // To demonstrate how deterministic attacker code cannot sense covert
      // channels, we provide a pretty obvious covert channel: we compare one
      // character at a time, and busy-wait a long time between characters.
      // The time we take indicates how many leading characters they got
      // right, enabling a linear-time guessing attack.

      guessedCode = `${guessedCode}`; // force into a String
      setAttackerGuess(guessedCode);
      for (let i = 0; i < 10; i++) {
        if (secretCode.slice(i, i + 1) !== guessedCode.slice(i, i + 1)) {
          return false;
        }
        delayMS(10);
      }
      // they guessed correctly
      enableAttacker = false;
      setLaunch(true);
      return true;
    }

    function submitProgram(program) {
      // the attacker's code will be submitted here. We expect it to be a
      // generator function, starting with 'function*' and ending with the
      // closing curly brace

      program = `(${program})`; // turn it into an expression

      enableAttacker = true;
      setLaunch(false);

      const attacker = SES.confine(program, { guess });
      const attackGen = attacker(); // build the generator
      function nextGuess() {
        if (!enableAttacker) {
          return; // attacker was interrupted, so don't ask
        }
        // give the attacker another chance to run
        if (attackGen.next().done) {
          return; // attacker gave up, so stop asking
        }
        if (!enableAttacker) {
          return; // attacker was correct, so stop asking
        }
        // now let the UI refresh before we call attacker again
        refreshUI().then(nextGuess);
      }
      nextGuess();
    }

    function stopAttacker() {
      enableAttacker = false;
    }

    return harden({ submitProgram, stopAttacker });
  }

  return `${defender}; defender()`;
}

start();
console.log('loaded');
/* eslint-enable no-plusplus, no-use-before-define */
