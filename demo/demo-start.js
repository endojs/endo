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
    // return a Promise that fires (with a value of 'undefined') 'count'
    // milliseconds in the future
    return new Promise((resolve, reject) => window.setTimeout(resolve, count, undefined));
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

  const { allZeros, counter } = sampleAttacks();

  document.getElementById('sample-0').addEventListener('click', function() {
    setSampleBody(`${allZeros}`);
  });

  document.getElementById('sample-counter').addEventListener('click', function() {
    setSampleBody(`${counter}`);
  });

}

function sampleAttacks() {
  // define these to appease the syntax-highlighter in my editor. We don't
  // actually use these values.
  let interact, setGuess, checkEnabled;

  function allZeros() {
    setGuess('0000000000');
  }

  function counter() {
    let i = 0;
    function submitNext() {
      if (!checkEnabled()) {
        return;
      }
      let guess = i.toString(36).toUpperCase();
      while (guess.length < 10) {
        guess = '0' + guess;
      }
      i += 1;
      setGuess(guess).then(submitNext);
    }
    submitNext();
  }

  return { allZeros, counter };
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
      const secretCode = [];
      let secretCodeStr = '';
      const SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      getRandomValues(array);
      for (let i=0; i < 10; i++) {
        // we use Uint32Array, instead of Uint8Array, to reduce the bias
        // somewhat. Actual launch codes should use a 128-bit integer before
        // wrapping down to a single digit.
        //
        // Also please use don't use this for launch codes.
        const digit = array[i] % SYMBOLS.length;
        secretCode.push(digit);
        secretCodeStr += SYMBOLS.slice(digit, digit+1);
      }
      return { secretCode, secretCodeStr };
    }

    const { secretCode, secretCodeStr } = buildSecretCode();
    setMacguffinText(secretCodeStr);

    let enableAttacker = false;

    function interact(index) {
      // To demonstrate how deterministic attacker code cannot sense covert
      // channels, we provide a pretty obvious covert channel. We return a
      // Promise that fires N milliseconds in the future, where N is the
      // value of an attacker-selected digit. A non-deterministic attacker
      // could use this to read out the code, one digit at a time, just like
      // WOPR.

      index = Number(index); // guard against non-numbers
      if (!index.isInteger() || index < 0 || index >= 10) {
        throw new Error('bad index');
      }
      const digit = secretCode[index];
      return delayMS(digit);
    }

    function setGuess(code) {
      // set the guess, then return a Promise that fires shortly, so the
      // attacker can try a lot and still let the window get refreshed
      setAttackerGuess(code);
      if (code === secretCodeStr) {
        enableAttacker = false;
        launch();
      }
      return delayMS(100);
    }

    function checkEnabled() {
      return enableAttacker;
    }

    function submitProgram(program) {
      // the attacker's code will be submitted here
      enableAttacker = true;
      SES.confine(program, { interact, setGuess, checkEnabled });
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

