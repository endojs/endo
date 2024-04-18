// @ts-check

import { M } from '@endo/patterns';

export const WorkerInterface = M.interface('EndoWorker', {});

export const HostInterface = M.interface(
  'EndoHost',
  {},
  { defaultGuards: 'passable' },
);

export const GuestInterface = M.interface(
  'EndoGuest',
  {},
  { defaultGuards: 'passable' },
);

export const InvitationInterface = M.interface(
  'EndoInvitation',
  {},
  { defaultGuards: 'passable' },
);

export const InspectorHubInterface = M.interface(
  'EndoInspectorHub',
  {},
  { defaultGuards: 'passable' },
);

export const InspectorInterface = M.interface(
  `EndoInspector`,
  {},
  { defaultGuards: 'passable' },
);

export const BlobInterface = M.interface(
  'EndoBlobInterface',
  {},
  { defaultGuards: 'passable' },
);

export const ResponderInterface = M.interface(
  'EndoResponder',
  {},
  {
    defaultGuards: 'passable',
  },
);

export const EnvelopeInterface = M.interface('EndoEnvelope', {});

export const DismisserInterface = M.interface(
  'EndoDismisser',
  {},
  { defaultGuards: 'passable' },
);

export const HandleInterface = M.interface(
  'EndoHandle',
  {},
  {
    defaultGuards: 'passable',
  },
);

export const DirectoryInterface = M.interface(
  'EndoDirectory',
  {},
  {
    defaultGuards: 'passable',
  },
);

export const DaemonFacetForWorkerInterface = M.interface(
  'EndoDaemonFacetForWorker',
  {},
);

export const WorkerFacetForDaemonInterface = M.interface(
  'EndoWorkerFacetForDaemon',
  {},
  { defaultGuards: 'passable' },
);

export const EndoInterface = M.interface(
  'Endo',
  {},
  {
    defaultGuards: 'passable',
  },
);

export const AsyncIteratorInterface = M.interface(
  'AsyncIterator',
  {},
  {
    defaultGuards: 'passable',
  },
);
