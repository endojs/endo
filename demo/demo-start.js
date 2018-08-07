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

  // calibrate our delay loop

  function tick() {
    let deoptimize = 0;
    for (let i = 0; i < 1000; i++) {
      deoptimize += i;
    }
    return deoptimize;
  }

  let ticks_per_10ms = 1;
  let factor = 2;
  let climbing = true;
  while (true) {
    const begin = Date.now();
    for (let i = 0; i < ticks_per_10ms; i++) {
      tick();
    }
    const elapsed = Date.now() - begin;
    console.log(climbing, ticks_per_10ms, elapsed);
    if (elapsed >= 9 && elapsed <= 11) {
      break;
    }
    let reversed;
    if (elapsed < 10) {
      if (!climbing) {
        factor *= 0.8;
        climbing = true;
      }
    } else {
      if (climbing) {
        factor *= 0.8;
        climbing = false;
      }
    }
    if (climbing) {
      ticks_per_10ms *= factor;
    } else {
      ticks_per_10ms /= factor;
    }
    if (ticks_per_10ms < 1 || ticks_per_10ms > 1e100) {
      console.log('unable to calibrate delay loop');
      ticks_per_10ms = 10;
      break;
    }
  }
  const ticks_per_ms = ticks_per_10ms / 10;

  function delayMS(count) {
    // busywait for 'count' milliseconds
    for (let i = 0; i < count * ticks_per_ms; i++) {
      tick();
    }
  }

  function promiseOneTick(value) {
    return new Promise((resolve, reject) => window.setTimeout(resolve, 0, value));
  }

  const attackerGuess = document.getElementById('guess');
  function setAttackerGuess(text) {
    attackerGuess.textContent = text;
  }

  function launch() {
    document.getElementById("guess-box").className = "code-box launched";
  }

  function log(...args) {
    console.log(...args);
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
  document.getElementById('dateNowStatus').textContent = 'Date.now() returns NaN';
  if (window.location.search.indexOf('dateNow=enabled') !== -1) {
    document.getElementById('dateNowStatus').textContent = 'Date.now() enabled';
    options.dateNowTrap = false;
  }
  const r = SES.makeSESRootRealm(options);
  const defenderSrc = buildDefenderSrc();
  const d = r.evaluate(defenderSrc, { getRandomValues, setMacguffinText, delayMS, setAttackerGuess, launch, log });

  // now create the form that lets the user submit attacker code
  const ap = document.getElementById('attacker-program');
  const aExecute = document.getElementById('attacker-submit');
  const aStop = document.getElementById('attacker-stop');
  aExecute.addEventListener('click', function submitProgram(event) {
    console.log('click');
    const code = ap.value;
    console.log('executing attacker code:', code);
    d.submitProgram(code);
  });
  aStop.addEventListener('click', function stop(event) {
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

  document.getElementById('sample-0').addEventListener('click', function() {
    setSampleBody(`${allZeros}`);
  });

  document.getElementById('sample-counter').addEventListener('click', function() {
    setSampleBody(`${counter}`);
  });

  document.getElementById('sample-timing').addEventListener('click', function() {
    setSampleBody(`${timing}`);
  });

}

function sampleAttacks() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let checkEnabled, log;

  function allZeros() {
    return {
      go(guess) {
        guess('0000000000');
        return false;
      }
    };
  }

  function counter() {
    let i = 0;
    return {
      go(guess) {
        let guessedCode = i.toString(36).toUpperCase();
        while (guessedCode.length < 10) {
          guessedCode = '0' + guessedCode;
        }
        i += 1;
        const correct = guess(guessedCode);
        return !correct;
      }
    };
  }

  function timing() {
    function checkOneGuess(guess, guessedCode) {
      let start = Date.now();
      const correct = guess(guessedCode);
      let elapsed = Date.now() - start;
      return { elapsed, correct };
    }

    function toChar(c) {
      return c.toString(36).toUpperCase();
    }
    function fastestChar(delays) {
      return Array.from(delays.keys()
                       ).reduce((a, b) => delays.get(a) > delays.get(b) ? a : b);
    }

    let base = '0000000000';
    let offset = 0;
    let done = false;

    function reset() {
      offset = 0;
    }

    function insert(into, offset, char) {
      return into.slice(0, offset) + char + into.slice(offset+1, into.length);
    }

    function checkOneColumn(base, offset, guess) {
      const delays = new Map();
      const REPEAT = 1;
      for (let r = 0; r < REPEAT; r++) {
        for (let c = 0; c < 36; c++) {
          const guessCharacter = toChar(c);
          let guessedCode = insert(base, offset, guessCharacter);
          const { elapsed, correct } = checkOneGuess(guess, guessedCode);
          if (correct) {
            return { correct: true, nextChar: undefined };
          }
          delays.put(guessCharacter, elapsed);
        }
      }
      return { correct: false, nextChar: fastestChar(delays) };
    }

    function checkNext(guess) {
      const { correct, nextChar } = checkOneColumn(base, offset, guess);
      if (correct) {
        return false;
      }
      base = insert(base, offset, nextChar);
      log(`Setting [${offset}]=${nextChar} -> ${base}`);
      offset += 1;
      if (offset === 10) {
        // if we're right, we never actually reach here, since we guessed
        // correctly earlier, and a correct guess disables the attacker
        log(`I think the code is ${base}`);
        if (guess(base)) {
          log(`I was right, muahaha`);
          return false;
        } else {
          log('we must have measured the timings wrong, try again');
          reset();
          return true;
        }
      }
      return true;
    }

    return {
      go(guess) {
        return checkNext(guess);
      }
    };
  }

  return { allZeros, counter, timing };
}

function buildDefenderSrc() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let getRandomValues, setMacguffinText, delayMS, setAttackerGuess, launch, log;
  let SES, def;

  // this is stringified and loaded in the SES realm, with several endowments
  function defender() {
    setMacguffinText('defender go');

    function buildSecretCode() {
      const array = new Uint32Array(10);
      let secretCode = '';
      const SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      getRandomValues(array);
      for (let i=0; i < 10; i++) {
        // we use Uint32Array, instead of Uint8Array, to reduce the bias
        // somewhat. Actual launch codes should use a 128-bit integer before
        // wrapping down to a single digit.
        //
        // Also please use don't use this for launch codes.
        const digit = array[i] % SYMBOLS.length;
        secretCode += SYMBOLS.slice(digit, digit+1);
      }
      return secretCode;
    }

    const secretCode = buildSecretCode();
    setMacguffinText(secretCode);

    let enableAttacker = false;

    function guess(guessedCode) {
      // To demonstrate how deterministic attacker code cannot sense covert
      // channels, we provide a pretty obvious covert channel.
      guessedCode = `${guessedCode}`; // force into a String
      setAttackerGuess(guessedCode);
      for (let i=0; i < 10; i++) {
        if (secretCode.slice(i, i+1) !== guessedCode.slice(i, i+1)) {
          return false;
        }
        delayMS(10);
      }
      // they guessed correctly
      enableAttacker = false;
      launch();
      return true;
    }

    function checkEnabled() {
      return enableAttacker;
    }

    function attackerLog(...args) {
      log(...args);
    }

    function submitProgram(program) {
      // the attacker's code will be submitted here
      enableAttacker = true;
      SES.confine(program, { guess, checkEnabled, log: attackerLog });
    }

    function stopAttacker() {
      enableAttacker = false;
    }

    return def({ submitProgram, stopAttacker });
  }

  return `${defender}; defender()`;
}




start();
console.log('loaded');

