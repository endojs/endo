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

  function delayMS(count, value) {
    // return a Promise that fires (with 'value') 'count' milliseconds in the
    // future
    return new Promise((resolve, reject) => window.setTimeout(resolve, count, value));
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

  // build the SES Realm and evaluate the defender inside
  const r = SES.makeSESRootRealm();
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
  let guess, checkEnabled, log;

  function allZeros() {
    guess('0000000000');
  }

  function counter() {
    let i = 0;
    function submitNext(correct) {
      if (correct || !checkEnabled()) {
        return;
      }
      let guessedCode = i.toString(36).toUpperCase();
      while (guessedCode.length < 10) {
        guessedCode = '0' + guessedCode;
      }
      i += 1;
      guess(guessedCode).then(submitNext);
    }
    submitNext(false);
  }

  function timing() {
    function checkOneGuess(guessedCode) {
      let start = Date.now();
      return guess(guessedCode).then(correct => {
        let elapsed = Date.now() - start;
        return { elapsed, correct };
      });
    }
    function toChar(c) {
      return c.toString(36).toUpperCase();
    }
    function fastestChar(delays) {
      return Array.from(delays.keys()
                       ).reduce((a, b) => delays.get(a) > delays.get(b) ? a : b);
    }

    let known = '';
    let c = 0;
    let delays;

    function checkNext() {
      if (c === 0) {
        delays = new Map();
      }
      const guessCharacter = toChar(c);
      let guessedCode = known + guessCharacter;
      while (guessedCode.length < 10) {
        guessedCode = guessedCode + '0';
      }
      return checkOneGuess(guessedCode).then(o => {
        const { elapsed, correct } = o;
        if (correct || !checkEnabled()) {
          return true;
        }
        log(`delay(${guessedCode}) was ${elapsed}`);

        delays.set(guessCharacter, elapsed);
        c += 1;
        if (c === 36) {
          known = known + fastestChar(delays);
          if (known.length === 10) {
            return guess(known);
          }
          c = 0;
        }
        return checkNext();
      });
    }

    checkNext();
  }

  return { allZeros, counter, timing };
}

function buildDefenderSrc() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let getRandomValues, setMacguffinText, delayMS, setAttackerGuess, launch, log;
  let SES;

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
      let delay = 0;
      for (let i=0; i < 10; i++) {
        if (secretCode.slice(i, i+1) !== guessedCode.slice(i, i+1)) {
          return delayMS(delay, false);
        }
        delay += 10;
      }
      // they guessed correctly
      enableAttacker = false;
      launch();
      return delayMS(delay, true);
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

    return { submitProgram, stopAttacker };
  }

  return `${defender}; defender()`;
}




start();
console.log('loaded');

