// https://github.com/tc39/proposal-compartments b420786 on Jul 6

// Shared space by Realm
type FullSpecifier = string;
type ModuleNamespace = object;
// Used to create a Reusable Instance factory for Module Records
// exotic
interface StaticModuleRecord {
  // intend to add reflection of import/export bindings

  // needs to allow duplicates
  staticImports(): {specifier: string, exportNames}[];
}
interface SourceTextStaticModuleRecord extends StaticModuleRecord {
  // no coerce
  constructor(source: string);
}
type CompartmentConstructorOptions = {
  // JF has a better way for:
  //   randomHook(): number; // Use for Math.random()
  //   nowHook(): number; // Use for both Date.now() and new Date(),
  // Supplied during Module instance creation instead of option
  //   hasSourceTextAvailableHook(scriptOrModule): bool; // Used for censorship
  resolveHook?: (name: string, referrer: FullSpecifier) => FullSpecifier

  // timing
  // importHook delegates to importNowHook FIRST,
  // they share a memo cache
  // order to ensures importNow never allows async value of import
  // to be accessed prior to any attached promise
  importHook?: (fullSpec: FullSpecifier) => Promise<StaticModuleRecord>;
  importNowHook?: (fullSpec: FullSpecifier) => StaticModuleRecord?;

  // copy own props after return
  importMetaHook?: (fullSpec: FullSpecifier) => object

  // e.g.: 'fr-FR' - Affects appropriate ECMA-402 APIs within Compartment
  localeHook?: () => string;
  // This is important to be able to override for deterministic testing and such
  localTZAHook?: () => string;

  // determines if the fn is acting as an "eval" function
  isDirectEvalHook?: (evalFunctionRef: any) => boolean;

  // prep for trusted types non-string
  canCompileHook?: (source: any, /*@@not sure how to do this in ts: {
    evaluator: functionRef, // can be a value from isDirectEvalHook
    isDirect?: boolean,
  }*/) => boolean; // need to allow mimicing CSP including nonces
};
// Exposed on global object
// new Constructor per Compartment
//
// CreateRealm needs to be refactored to take params
//  - intrinsics: an intrinsics record from
//                6.1.7.4 Well-Known Intrinsic Objects
class Compartment {
  constructor(
    // extra bindings added to the global
    endowments?: {
      [globalPropertyName: string]: any
    },
    // need to figure out module attributes as it progresses
    // maps child specifier to parent specifier
    moduleMap?: {[key: FullSpecifier]: FullSpecifier | ModuleNamespace},
    // including hooks like isDirectEvalHook
    options?: CompartmentConstructorOptions
  ): Compartment // an exotic compartment object

  // access this compartment's global object, getter
  globalThis: object;

  // do an eval in this compartment
  // default is strict indirect eval
  evaluate(
    // trusted types prep means use of `any`
    src: any,
    // FUTURE:
    //   for other eval goals like Module, need to discuss import()/eval() to
    //   get other Goals vs an option
    // options?: object
  ): any;

  // Return signature differs to allow avoiding then() exports
  // Used to ensure ability to be compatible with static import
  async import(specifier: string): Promise<{namespace: ModuleNamespace}>;
  // Desired by TC53
  importNow(specifier: string): ModuleNamespace;
  // Necessary to thread a module exports namespace from this compartment into
  // the `moduleMap` Compartment constructor argument, without importing (and
  // consequently executing) the module.
  module(specifier: string): ModuleNamespace;
}

