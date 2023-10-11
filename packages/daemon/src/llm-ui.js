import { Far } from '@endo/far';
import chatgptBundle from '../dist-llm-bundle.js';
import { makeReaderRef } from './reader-ref.js';

const textEncoder = new TextEncoder();

const state = loadState()
// always reinstall bc persistence is broken in endo
state.isInstalled = false

const actions = {
  init: ({ apiKey }) => {
    state.apiKey = apiKey
    state.isInitialized = true
    setState(state)
  }
}
let container

render(document.body, state, actions)


function renderMain(parent, state, actions) {
  const display = document.createElement('div')
  display.innerText = 'ready!'
  parent.appendChild(display)
  // const input = document.createElement('input')
  // input.placeholder = 'request name'
  // parent.appendChild(input)
  // const button = document.createElement('button')
  // button.innerText = 'request'
  // parent.appendChild(button)
  
  // button.addEventListener('click', () => {
  //   E(getBootstrap()).request('SELF', 'description', input.value).then(() => {
  //     display.innerText = 'approved!'
  //   }, () => {
  //     display.innerText = 'rejected :('
  //   })
  // })
}

function renderInstall(parent, state, actions) {
  const span = document.createElement('span')
  span.innerText = 'installing...'
  parent.appendChild(span)
}

function renderInit(parent, state, actions) {
  const input = document.createElement('input')
  input.type = 'password'
  input.placeholder = 'sk-1234'
  parent.appendChild(input)
  
  input.addEventListener('change', () => {
    actions.init({ apiKey: input.value })
  })
}

function render (parent, state, actions) {
  if (container) {
    parent.removeChild(container)
  }
  container = document.createElement('div')
  parent.appendChild(container)
  if (!state.isInstalled) {
    return renderInstall(container, state, actions)
  }
  if (!state.isInitialized) {
    return renderInit(container, state, actions)
  }
  renderMain(container, state, actions)
}

function setState (state) {
  localStorage.setItem('llm.ocaps', JSON.stringify(state))
  render(document.body, state, actions)
}

function loadState () {
  const raw = localStorage.getItem('llm.ocaps')
  if (raw) {
    return JSON.parse(raw)
  } else {
    return {}
  }
}


export const make = async (powers) => {
  console.log('make chatgpt');
  const bundle = chatgptBundle;
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const bundleReaderRef = makeReaderRef([bundleBytes]);
  const bundleName = 'chatgpt-bundle';
  await E(powers).store(bundleReaderRef, bundleName);
  console.log(`Stored bundle ${bundleName}`);

  // const workerName = 'chatgpt-worker';
  const resultName = 'chatgpt';
  await E(powers).importBundleAndEndow(
    'NEW', //workerName,
    bundleName,
    // 'NONE', // powersName,
    // 'ENDO',
    'HOST',
    resultName,
  );
  console.log(`Imported bundle ${bundleName} as ${resultName}`);

  const llmFacet = await E(powers).lookup(resultName)
  await E(llmFacet).setApiKey(state.apiKey)

  state.isInstalled = true
  setState(state)

  return Far('ChatGptUi', {});
}