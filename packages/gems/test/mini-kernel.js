import '@endo/init';
import { reincarnate } from '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { E, Far } from '@endo/far';
import { makeCaptpPair } from './util.js';

// TODO: import?
const makeBaseRef = (kindID, id, isDurable) => {
  return `o+${isDurable ? 'd' : 'v'}${kindID}/${id}`;
}

const setupWorld = fakeStore => {
  const { fakeVomKit } = reincarnate({
    relaxDurabilityRules: false,
    fakeStore,
  });
  const { vom, cm, vrm } = fakeVomKit;
  const flush = () => {
    vom.flushStateCache();
    cm.flushSchemaCache();
    vrm.flushIDCounters();
  };
  const baggage = cm.provideBaggage();
  return { baggage, flush, fakeVomKit };
};

const makeVat = () => {
  let fakeStore;
  let baggage;
  let flush;
  let fakeVomKit;
  let vatSupervisor;
  let classCache;
  const classRegistry = new Map();

  const loadClass = name => {
    if (classCache.has(name)) {
      return classCache.get(name);
    }
    const { interfaceGuards, initFn, methods } = classRegistry.get(name);
    const exoClass = vatSupervisor.zone.exoClass(
      name,
      interfaceGuards,
      initFn,
      methods,
    );
    classCache.set(name, exoClass);
    return exoClass;
  };

  const loadClasses = () => {
    for (const name of classRegistry.keys()) {
      loadClass(name);
    }
  };

  const registerClass = (name, interfaceGuards, initFn, methods) => {
    classRegistry.set(name, { name, interfaceGuards, initFn, methods });
    return loadClass(name);
  };

  const restart = () => {
    if (flush) {
      flush();
    }
    classCache = new Map();
    fakeStore = new Map(fakeStore);
    ({ baggage, flush, fakeVomKit } = setupWorld(fakeStore));
    const zone = makeDurableZone(baggage);
    const store = zone.mapStore('store');
    vatSupervisor = { zone, store, registerClass };
    loadClasses();
    return { vatSupervisor, fakeStore, fakeVomKit };
  };

  return {
    restart,
  };
};

function installExternalReferenceController (externalRefZone, fakeVomKit, vatSideKernel) {
  const store = externalRefZone.mapStore('controller');
  const data = externalRefZone.mapStore('data');
  const { vom, vrm, fakeStuff } = fakeVomKit;
  const isDurable = true;

  if (!store.has('kindID')) {
    store.init('kindID', `${vrm.allocateNextID('exportID')}`);
    store.init('nextInstanceID', 1n);
  }
  const kindID = store.get('kindID');

  const getAndIncrementNextInstanceID = () => {
    const nextInstanceID = store.get('nextInstanceID');
    store.set('nextInstanceID', nextInstanceID + 1n);
    return nextInstanceID;
  }

  const reanimate = (baseRef) => {
    console.log('reanimate extRef', baseRef)
    const context = data.get(baseRef);
    const { ref: kernelRef } = context;
    return E(vatSideKernel).lookup(kernelRef);
  }
  const make = (context = harden({})) => {
    console.log('make extRef')
    const id = getAndIncrementNextInstanceID();
    const baseRef = makeBaseRef(kindID, id, isDurable);
    data.init(baseRef, context);
    // TODO: any additional init should happen before reanimate
    const value = reanimate(baseRef);
    fakeStuff.registerEntry(baseRef, value, false);
    return value;
  }
  const cleanup = () => {
    console.log('cleanup extRef')
    // indicate no further GC needed
    return false;
  }

  vrm.registerKind(kindID, reanimate, cleanup, isDurable);

  return make;
}

function simulateKernelVatConnection (vatSupervisor, fakeVomKit) {
  const { makeLeft, makeRight } = makeCaptpPair();
  const kernelSide = makeLeft('kernel', Far('kernel', {
    lookup(kernelRef) {
      // temp never
      // return new Promise((resolve, reject) => {});
      return Far('kernel widget', {
        ping () {
          return 'pong';
        }
      })
    }
  }));
  const vatSide = makeRight('vat', Far('vat', {}));
  const kernelSideVat = kernelSide.getBootstrap();
  const vatSideKernel = vatSide.getBootstrap();
  return { kernelSide, vatSide, kernelSideVat, vatSideKernel };
}

function systemSetup ({ vatSupervisor, fakeVomKit, vatSideKernel }) {
  const externalRefZone = vatSupervisor.zone.subZone('ExternalRef');
  const makeExternalReference = installExternalReferenceController(externalRefZone, fakeVomKit, vatSideKernel);

  return { makeExternalReference };
}


const vat = makeVat();

let { vatSupervisor, fakeVomKit } = vat.restart();
let fakeConnectionKit = simulateKernelVatConnection(vatSupervisor, fakeVomKit);
const { makeExternalReference } = systemSetup({ vatSupervisor, fakeVomKit, vatSideKernel: fakeConnectionKit.vatSideKernel });

// console.log('<-------------- register Widget')
// const makeWidget = vatSupervisor.registerClass(
//   'Widget',
//   undefined,
//   (count = 0) => ({ count }),
//   {
//     increment() {
//       this.state.count += 1;
//       return this.state.count;
//     },
//   },
// );
// console.log('<-------------- make widget')
// const widget = makeWidget(0);
// console.log('<-------------- store widget')
// vatSupervisor.store.init('widget', widget);

// create new instance and save it
const remoteKernelWidget = makeExternalReference(harden({ kernelRef: 'boing' }));
vatSupervisor.store.init('ext', remoteKernelWidget);

// restart and re-register custom type
({ vatSupervisor, fakeVomKit } = vat.restart());
fakeConnectionKit = simulateKernelVatConnection(vatSupervisor, fakeVomKit);
systemSetup({ vatSupervisor, fakeVomKit, vatSideKernel: fakeConnectionKit.vatSideKernel });

// create new instance and save it
const remoteKernelWidget2 = vatSupervisor.store.get('ext');

E(remoteKernelWidget2).ping().then(console.log);