/* global window, document */
/* eslint-disable no-plusplus */

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

lockdown();
{
  console.log('starting');

  // Helpers

  const $ = selector => document.querySelector(selector);

  // ********************
  // 1. Should we endow the real `Date`?
  // ********************

  const urlsp = new URLSearchParams(window.location.search);
  const nowEnabled = urlsp.get('dateNow') === 'enabled';
  const dateEndowment = nowEnabled ? { Date } : {};
  $('#dateNowStatus').textContent = nowEnabled
    ? 'Date.now() enabled'
    : 'Date.now() disabled';

  // ********************
  // 2. We prepare APIs for the defender code.
  // ********************

  function getRandomValues(array) {
    window.crypto.getRandomValues(array);
  }

  // https://www.dafont.com/hyperspace.font
  function setMacguffinText(text) {
    $('#macguffin').textContent = text;
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

  function setAttackerGuess(text) {
    $('#guess').textContent = text;
  }

  function setLaunch(status) {
    if (status) {
      $('#guess-box').className = 'code-box launched';
    } else {
      $('#guess-box').className = 'code-box';
    }
  }

  function setProgram(code) {
    $('#attacker-program').value = code;
  }

  function getProgram() {
    return $('#attacker-program').value;
  }

  // ********************
  // 3. We prepare the defender code.
  // ********************

  setMacguffinText('defender go');

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

  // ********************
  // 4. We prepare the confinement.
  // ********************

  let enableAttacker = false;
  let attackerExecutionResult = Promise.resolve();
  function stopAttacker() {
    enableAttacker = false;
    setLaunch(false);
  }
  function startAttacker() {
    enableAttacker = true;
    setLaunch(true);
  }

  async function guess(guessedCode) {
    // guess() is an exposed API: we must cast into a String to avoid TOCTOU.
    guessedCode = `${guessedCode}`;

    // To demonstrate how deterministic attacker code cannot sense covert
    // channels, we provide a pretty obvious covert channel: we compare one
    // character at a time, and busy-wait a long time between characters.
    // The time we take indicates how many leading characters they got
    // right, enabling a linear-time guessing attack.

    setAttackerGuess(guessedCode);
    for await (const [i, char] of [...secretCode].entries()) {
      if (guessedCode.at(i) !== char) {
        return false;
      }
      delayMS(10);
    }

    // they guessed correctly
    stopAttacker();
    return true;
  }

  harden(guess);
  const compartment = new Compartment({
    console,
    assert,
    guess,
    ...dateEndowment,
  });

  async function submitProgram(program) {
    // the attacker's code will be submitted here. We expect it to be a
    // generator function, starting with 'function*' and ending with the
    // closing curly brace

    startAttacker();

    attackerExecutionResult = new Promise(resolve => {
      const attacker = compartment.evaluate(`(${program})`);
      resolve(attacker()); // build the generator
    }).catch(err => {
      console.log('Failed to execute attacker:', err);
      stopAttacker();
    });
    const attackAsyncGen = await attackerExecutionResult;
    async function nextGuess() {
      if (!enableAttacker) {
        return undefined; // attacker was interrupted, so don't ask
      }
      // give the attacker another chance to run
      attackerExecutionResult = Promise.resolve()
        .then(() => attackAsyncGen.next())
        .catch(err => {
          console.log('Failed to execute attacker guess:', err);
          return { done: true };
        });
      const guessResult = await attackerExecutionResult;
      if (guessResult.done) {
        return undefined; // attacker gave up, so stop asking
      }
      if (!enableAttacker) {
        return undefined; // attacker was correct or was interrupted, so stop asking
      }
      // now let the UI refresh before we call attacker again
      return refreshUI().then(nextGuess);
    }
    return nextGuess();
  }

  // ********************
  // 5. We prepare the the form that lets the user submit attacker code.
  // ********************

  $('#attacker-submit').addEventListener('click', _event => {
    console.log('submit');

    const code = getProgram();
    console.log('executing attacker code:', code);
    stopAttacker();

    // wait a moment to make sure the running program notices the stop request
    attackerExecutionResult.then(() => submitProgram(code));
  });

  $('#attacker-stop').addEventListener('click', _event => {
    console.log('stop');

    console.log('asking attacker code to stop');
    stopAttacker();
  });

  // ********************
  // 5. We provide some sample attacks
  // ********************
  /* eslint-disable no-await-in-loop */

  // IMPORTANT: These function are stingnified and evaluated in the compartent.
  // They pass the linter since the function guess() does resolved inside this file.

  async function* allZeros() {
    await guess('0000000000');
    yield;
  }

  async function* counter() {
    for (let i = 0; true; i++) {
      const guessedCode = i.toString(36).toUpperCase().padStart(10, '0');
      await guess(guessedCode);
      yield;
    }
  }

  async function* timing() {
    function toChar(c) {
      return c.toString(36).toUpperCase();
    }

    function fastestChar(delays) {
      const pairs = Array.from(delays.entries());
      pairs.sort((a, b) => b[1] - a[1]);
      return pairs[0][0];
    }

    function insert(into, offset, char) {
      return into.slice(0, offset) + char + into.slice(offset + 1, into.length);
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
          const start = Date.now();
          await guess(guessedCode);
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

  async function* zalgo() {
    function toChar(c) {
      return c.toString(36).toUpperCase();
    }

    function insert(into, offset, char) {
      return into.slice(0, offset) + char + into.slice(offset + 1, into.length);
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

    function fastestChar(delays) {
      const pairs = Array.from(delays.entries());
      pairs.sort((a, b) => b[1] - a[1]);
      return pairs[0][0];
    }

    async function countTurns(stop) {
      let turns = 0;
      let keepGoing = true;
      while (keepGoing === true) {
        keepGoing = await Promise.race([stop, Promise.resolve(true)]);
        turns += 1;
        if (turns > 10000) {
          throw new Error('Possible infinite loop');
        }
      }
      return turns;
    }

    let base = '0000000000';
    while (true) {
      for (let offset = 0; offset < 10; offset++) {
        const turns = new Map();
        for (let c = 0; c < 36; c++) {
          const guessedCode = buildCode(base, offset, c);
          const guessed = Promise.resolve()
            .then(() => guess(guessedCode))
            .then(() => false);
          const elapsed = await countTurns(guessed);
          turns.set(toChar(c), elapsed);
          yield; // allow UI to refresh
          // if our guess was right, then on the last character
          // (offset===9) we never actually reach here, since we guessed
          // correctly earlier, and when the attacker guesses correctly,
          // the defender stops calling go()
        }
        console.log(turns);
        const nextChar = fastestChar(turns);
        base = insert(base, offset, nextChar);
        console.log(`Setting code[${offset}]=${nextChar} -> ${base}`);
      }
      console.log('we must have measured the timings wrong, try again');
    }
  }

  $('#sample-0').addEventListener('click', () => {
    setProgram(`${allZeros}`);
  });

  $('#sample-counter').addEventListener('click', () => {
    setProgram(`${counter}`);
  });

  $('#sample-timing').addEventListener('click', () => {
    setProgram(`${timing}`);
  });

  $('#sample-zalgo').addEventListener('click', () => {
    setProgram(`${zalgo}`);
  });

  console.log('loaded');
}

/* eslint-enable no-plusplus */
