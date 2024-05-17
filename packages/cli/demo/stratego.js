import { E, Far } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

export const make = powers => {
  const $parent = document.body;
  $parent.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        height: 100vh;
        overflow: hidden;
        font-size: 400%;
      }
      .frame {
        position: absolute;
        height: 100vh;
        width: 100vw;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .window {
        margin: 20px;
        padding: 20px;
        border-radius: 10px;
        overflow: auto;
        align-self: center;
        flex: none;
        text-align: center;
      }
      button {
        font-size: 300%;
      }
    </style>
    <div class="frame">
      <div class="window">
        <button id="strategize">Strategize</button>
      </div>
    </div>
  `;

  const strategies = ['🪨', '📄', '✂️'];
  const $strategize = $parent.querySelector('#strategize');
  $strategize.onclick = event => {
    event.preventDefault();
    const strategy = strategies[Math.floor(performance.now() * 1000) % 3];
    E(powers).send('HOST', [`I recommend ${strategy}.`], [], []);
  };
};
