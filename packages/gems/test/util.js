import { makePipe } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';
import { makeKernel } from '../src/kernel.js';
import { makeMessageCapTP } from '../src/daemon-vendor/connection.js';
import { makeReconnectingPresenceController } from '../src/presence-controller.js';
import {
  installExternalReferenceController,
  makeCaptpOptionsForExtRefController,
} from '../src/extref-controller.js';

const never = new Promise(() => {});

export const makeKernelFactory = () => {
  let kernel;
  let kernelVatState = [];

  const stop = async () => {
    await null;
    if (kernel) {
      await kernel.shutdown();
      kernelVatState = kernel.vatSupervisor.serializeState();
      kernel = null;
    }
  };

  const restart = async () => {
    await stop();
    kernel = await makeKernel(kernelVatState);
    return { kernel };
  };

  const clear = async () => {
    await stop();
    kernelVatState = [];
  };

  return {
    stop,
    restart,
    clear,
  };
};

const makeConnectionPair = () => {
  const [writerA, readerB] = makePipe();
  const [writerB, readerA] = makePipe();
  return {
    aliceConnection: { writer: writerA, reader: readerA },
    bobConnection: { writer: writerB, reader: readerB },
  };
};

export const makeCaptpPair = ({
  aliceBootstrap,
  aliceCaptpOpts,
  bobBootstrap,
  bobCaptpOpts,
  cancelled = never,
}) => {
  const { aliceConnection, bobConnection } = makeConnectionPair();
  const aliceCaptp = makeMessageCapTP(
    'Alice',
    aliceConnection.writer,
    aliceConnection.reader,
    cancelled,
    aliceBootstrap,
    aliceCaptpOpts,
  );
  const bobCaptp = makeMessageCapTP(
    'Bob',
    bobConnection.writer,
    bobConnection.reader,
    cancelled,
    bobBootstrap,
    bobCaptpOpts,
  );
  return { aliceCaptp, bobCaptp };
};

const prepareReconnectingCaptpKit = (name, getConnection, zone, fakeVomKit) => {
  const presenceController = makeReconnectingPresenceController({
    getConnection,
  });
  const extRefController = installExternalReferenceController(
    name,
    zone,
    fakeVomKit,
    presenceController,
  );
  const captpOpts = makeCaptpOptionsForExtRefController(extRefController);
  return { presenceController, captpOpts };
};

export const makeReconnectingCaptpPair = ({
  kernel,
  aliceBootstrap,
  bobBootstrap,
}) => {
  let cancelledPromiseKit;
  let captpPair;

  const { fakeVomKit } = kernel.vatSupervisor;
  const aliceZone = kernel.vatSupervisor.zone.subZone('alice');
  const bobZone = kernel.vatSupervisor.zone.subZone('bob');

  let aliceReconnectKit;
  let bobReconnectKit;

  const connect = () => {
    if (captpPair) {
      return captpPair;
    }
    cancelledPromiseKit = makePromiseKit();
    captpPair = makeCaptpPair({
      aliceBootstrap,
      aliceCaptpOpts: aliceReconnectKit.captpOpts,
      bobBootstrap,
      bobCaptpOpts: bobReconnectKit.captpOpts,
      cancelled: cancelledPromiseKit.promise,
    });
    return captpPair;
  };
  const disconnectCaptp = () => {
    if (captpPair === undefined) {
      return;
    }
    captpPair = undefined;
    cancelledPromiseKit.reject(Error('disconnected'));
  };

  const getAliceConnection = async () => {
    const currentCaptpPair = connect();
    const vatConnection = { captp: currentCaptpPair.aliceCaptp.captp };
    return vatConnection;
  };
  const getBobConnection = async () => {
    const currentCaptpPair = connect();
    const vatConnection = { captp: currentCaptpPair.bobCaptp.captp };
    return vatConnection;
  };
  aliceReconnectKit = prepareReconnectingCaptpKit(
    'Alice',
    getAliceConnection,
    aliceZone,
    fakeVomKit,
  );
  bobReconnectKit = prepareReconnectingCaptpKit(
    'Bob',
    getBobConnection,
    bobZone,
    fakeVomKit,
  );

  const disconnect = () => {
    disconnectCaptp();
    aliceReconnectKit.presenceController.didDisconnect();
    bobReconnectKit.presenceController.didDisconnect();
  };

  return { connect, disconnect };
};
