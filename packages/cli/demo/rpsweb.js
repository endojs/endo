import { E, Far } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

export const make = bot => {
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
    </style>
    <div class="frame">
      <div class="window">
      </div>
    </div>
  `;

  const $window = $parent.querySelector('.window');

  (async () => {
    $window.innerText = '⏳';
    for await (const resultPromise of makeRefIterator(E(bot).subscribe())) {
      $window.innerText = '⌛️';
      const result = await resultPromise;
      $window.innerText = JSON.stringify(result);
    }
  })().catch(window.reportError);
};
