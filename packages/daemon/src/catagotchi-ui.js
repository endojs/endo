import { E, Far } from '@endo/far';
import { makeReaderRef } from './reader-ref';
import catagotchiBundle from '../dist-catagotchi-bundle.js'

const textEncoder = new TextEncoder();



export const make = async (powers) => {
  console.log('make catagotchi');
  const bundle = catagotchiBundle;
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const bundleReaderRef = makeReaderRef([bundleBytes]);
  const bundleName = 'catagotchi-bundle';
  await E(powers).store(bundleReaderRef, bundleName);
  console.log(`Stored bundle ${bundleName}`);

  // const workerName = 'catagotchi-worker';
  const resultName = 'catagotchi';
  await E(powers).importBundleAndEndow(
    'NEW', //workerName,
    bundleName,
    'NONE', // powersName,
    resultName,
  );
  console.log(`Imported bundle ${bundleName} as ${resultName}`);

  const catagotchi = await E(powers).lookup(resultName)

  const displayElement = document.createElement('h1');
  displayElement.innerText = 'Loading...';
  document.body.appendChild(displayElement);
  const descriptionElement = document.createElement('span');
  document.body.appendChild(descriptionElement);
  // add breaks before buttons
  document.body.appendChild(document.createElement('br'));
  document.body.appendChild(document.createElement('br'));

  const llmApi = await E(powers).request(
    'SELF', // 'HOST',
    'an ai provider',
    'my-llm',
  );

  const updateDisplay = async function () {
    const displayValue = await E(catagotchi)._getDisplay();
    displayElement.innerText = displayValue;
    const fulfillment = await E(catagotchi)._getFulfillment();
    const prompt = `
    You are a cute pet cat.
    Here's your Maslow's hierarchy of needs score (higher better): ${JSON.stringify(fulfillment)}
    Say a short cute message to your owner and try to convey your needs indirectly.
    `
    const message = await E(llmApi).askAi(prompt)
    descriptionElement.innerText = message;
  }
  await updateDisplay();

  // actions:
  makeActionButton(document.body, 'Feed', catagotchi, 'feed', updateDisplay);
  makeActionButton(document.body, 'Reassure', catagotchi, 'reassure', updateDisplay);
  makeActionButton(document.body, 'Pet', catagotchi, 'pet', updateDisplay);
  makeActionButton(document.body, 'Compliment', catagotchi, 'compliment', updateDisplay);
  makeActionButton(document.body, 'Instruct to do research', catagotchi, 'instructToDoResearch', updateDisplay);
  
  return Far('CatagotchiUi', {});
};

function makeActionButton (container, label, target, methodName, updateDisplay) {
  const onClick = async () => {
    await E(target)[methodName]();
    await updateDisplay();
  }
  const button = document.createElement('button');
  button.innerText = label;
  button.addEventListener('click', onClick);
  container.appendChild(button);
}
