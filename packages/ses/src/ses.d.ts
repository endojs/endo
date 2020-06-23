type safetyPreference = 'safe' | 'unsafe';

type LockdownOpts = {
  fringeSet?: {
    add?: Function,
    has?: Function,
  },
  dateTaming?: safetyPreference,
  errorTaming?: safetyPreference,
  mathTaming?: safetyPreference,
  regExpTaming?: safetyPreference,

  [extraOption:string]?: any,
};

declare var lockdown = (LockdownOpts) => void;

declare var harden = (any) => any;

declare class Compartment {
  constructor(endowments: Object);
  evaluate(command: string): any;
  globalThis: any;
  import: () => Promise<any>;
  importNow: () => any;
  module: Function;
}

declare var StaticModuleRecord = Object;

declare global {
  interface Window {
    lockdown: lockdown;
    harden: harden;
    Compartment: Compartment;
    StaticModuleRecord: StaticModuleRecord;
  }
}
