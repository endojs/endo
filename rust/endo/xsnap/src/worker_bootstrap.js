(functors => options => {
  'use strict';

  const {
    Map,
    Object,
    ReferenceError,
    Reflect,
    TypeError,
  } = globalThis;
  const {
    create,
    defineProperties,
    defineProperty,
    freeze,
    fromEntries,
    getOwnPropertyDescriptors,
    getOwnPropertyNames,
    keys,
  } = Object;
  const { get, set } = Reflect;

  const {
  } = options || {};



  const cell = (name, value = undefined) => {
    const observers = [];
    return freeze({
      get: freeze(() => {
        return value;
      }),
      set: freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
    {
      ZERO_N: cell("ZERO_N"),
      ONE_N: cell("ONE_N"),
      isNat: cell("isNat"),
      Nat: cell("Nat"),
    },
    {
      makeHardener: cell("makeHardener"),
    },
    {
      makeHardenerSelector: cell("makeHardenerSelector"),
    },
    {
      default: cell("default"),
    },
    {
      makeEnvironmentCaptor: cell("makeEnvironmentCaptor"),
      getEnvironmentOption: cell("getEnvironmentOption"),
      getEnvironmentOptionsList: cell("getEnvironmentOptionsList"),
      environmentOptionsListHas: cell("environmentOptionsListHas"),
    },
    {
    },
    {
      makeMessageBreakpointTester: cell("makeMessageBreakpointTester"),
    },
    {
      getMethodNames: cell("getMethodNames"),
      localApplyFunction: cell("localApplyFunction"),
      localApplyMethod: cell("localApplyMethod"),
      localGet: cell("localGet"),
    },
    {
      getMethodNames: cell("getMethodNames"),
      makeMessageBreakpointTester: cell("makeMessageBreakpointTester"),
    },
    {
      details: cell("details"),
      Fail: cell("Fail"),
      note: cell("note"),
      quote: cell("quote"),
      assert: cell("assert"),
      bare: cell("bare"),
      makeError: cell("makeError"),
      b: cell("b"),
      X: cell("X"),
      q: cell("q"),
      annotateError: cell("annotateError"),
      redacted: cell("redacted"),
      throwRedacted: cell("throwRedacted"),
      hideAndHardenFunction: cell("hideAndHardenFunction"),
    },
    {
      hasOwnPropertyOf: cell("hasOwnPropertyOf"),
      isPrimitive: cell("isPrimitive"),
      isObject: cell("isObject"),
      isTypedArray: cell("isTypedArray"),
      PASS_STYLE: cell("PASS_STYLE"),
      assertChecker: cell("assertChecker"),
      confirmOwnDataDescriptor: cell("confirmOwnDataDescriptor"),
      getTag: cell("getTag"),
      confirmPassStyle: cell("confirmPassStyle"),
      confirmTagRecord: cell("confirmTagRecord"),
      confirmFunctionTagRecord: cell("confirmFunctionTagRecord"),
    },
    {
      canBeMethod: cell("canBeMethod"),
      getRemotableMethodNames: cell("getRemotableMethodNames"),
      assertIface: cell("assertIface"),
      getInterfaceOf: cell("getInterfaceOf"),
      RemotableHelper: cell("RemotableHelper"),
    },
    {
      Remotable: cell("Remotable"),
      GET_METHOD_NAMES: cell("GET_METHOD_NAMES"),
      Far: cell("Far"),
      ToFarFunction: cell("ToFarFunction"),
    },
    {
      mapIterable: cell("mapIterable"),
      filterIterable: cell("filterIterable"),
    },
    {
      default: cell("default"),
    },
    {
      makeRepairError: cell("makeRepairError"),
      repairError: cell("repairError"),
      getErrorConstructor: cell("getErrorConstructor"),
      isErrorLike: cell("isErrorLike"),
      confirmRecursivelyPassableErrorPropertyDesc: cell("confirmRecursivelyPassableErrorPropertyDesc"),
      confirmRecursivelyPassableError: cell("confirmRecursivelyPassableError"),
      ErrorHelper: cell("ErrorHelper"),
    },
    {
      isPassableSymbol: cell("isPassableSymbol"),
      assertPassableSymbol: cell("assertPassableSymbol"),
      nameForPassableSymbol: cell("nameForPassableSymbol"),
      passableSymbolForName: cell("passableSymbolForName"),
      unpassableSymbolForName: cell("unpassableSymbolForName"),
    },
    {
      isWellFormedString: cell("isWellFormedString"),
      assertWellFormedString: cell("assertWellFormedString"),
      assertPassableString: cell("assertPassableString"),
    },
    {
      makeReleasingExecutorKit: cell("makeReleasingExecutorKit"),
    },
    {
      memoRace: cell("memoRace"),
    },
    {
      isPromise: cell("isPromise"),
    },
    {
    },
    {
      makePromiseKit: cell("makePromiseKit"),
      racePromises: cell("racePromises"),
    },
    {
      CopyArrayHelper: cell("CopyArrayHelper"),
    },
    {
      ByteArrayHelper: cell("ByteArrayHelper"),
    },
    {
      CopyRecordHelper: cell("CopyRecordHelper"),
    },
    {
      TaggedHelper: cell("TaggedHelper"),
    },
    {
      isSafePromise: cell("isSafePromise"),
      assertSafePromise: cell("assertSafePromise"),
    },
    {
      PassStyleOfEndowmentSymbol: cell("PassStyleOfEndowmentSymbol"),
      passStyleOf: cell("passStyleOf"),
      assertPassable: cell("assertPassable"),
      isPassable: cell("isPassable"),
      toPassableError: cell("toPassableError"),
      toThrowable: cell("toThrowable"),
    },
    {
      makeTagged: cell("makeTagged"),
    },
    {
      isCopyArray: cell("isCopyArray"),
      isByteArray: cell("isByteArray"),
      isRecord: cell("isRecord"),
      isRemotable: cell("isRemotable"),
      assertCopyArray: cell("assertCopyArray"),
      assertByteArray: cell("assertByteArray"),
      assertRecord: cell("assertRecord"),
      assertRemotable: cell("assertRemotable"),
      isAtom: cell("isAtom"),
      assertAtom: cell("assertAtom"),
    },
    {
      trackTurns: cell("trackTurns"),
    },
    {
      default: cell("default"),
    },
    {
    },
    {
      HandledPromise: cell("HandledPromise"),
      E: cell("E"),
    },
    {
      deeplyFulfilled: cell("deeplyFulfilled"),
    },
    {
    },
    {
      mapIterable: cell("mapIterable"),
      filterIterable: cell("filterIterable"),
      PASS_STYLE: cell("PASS_STYLE"),
      isObject: cell("isObject"),
      isPrimitive: cell("isPrimitive"),
      assertChecker: cell("assertChecker"),
      getTag: cell("getTag"),
      hasOwnPropertyOf: cell("hasOwnPropertyOf"),
      getErrorConstructor: cell("getErrorConstructor"),
      isErrorLike: cell("isErrorLike"),
      getInterfaceOf: cell("getInterfaceOf"),
      getRemotableMethodNames: cell("getRemotableMethodNames"),
      assertPassableSymbol: cell("assertPassableSymbol"),
      isPassableSymbol: cell("isPassableSymbol"),
      nameForPassableSymbol: cell("nameForPassableSymbol"),
      passableSymbolForName: cell("passableSymbolForName"),
      unpassableSymbolForName: cell("unpassableSymbolForName"),
      isWellFormedString: cell("isWellFormedString"),
      assertWellFormedString: cell("assertWellFormedString"),
      assertPassableString: cell("assertPassableString"),
      passStyleOf: cell("passStyleOf"),
      isPassable: cell("isPassable"),
      assertPassable: cell("assertPassable"),
      toPassableError: cell("toPassableError"),
      toThrowable: cell("toThrowable"),
      makeTagged: cell("makeTagged"),
      Remotable: cell("Remotable"),
      Far: cell("Far"),
      ToFarFunction: cell("ToFarFunction"),
      GET_METHOD_NAMES: cell("GET_METHOD_NAMES"),
      assertRecord: cell("assertRecord"),
      assertCopyArray: cell("assertCopyArray"),
      assertRemotable: cell("assertRemotable"),
      isRemotable: cell("isRemotable"),
      isRecord: cell("isRecord"),
      isCopyArray: cell("isCopyArray"),
      isAtom: cell("isAtom"),
      assertAtom: cell("assertAtom"),
    },
    {
      QCLASS: cell("QCLASS"),
      makeEncodeToCapData: cell("makeEncodeToCapData"),
      makeDecodeFromCapData: cell("makeDecodeFromCapData"),
    },
    {
      typedEntries: cell("typedEntries"),
      fromTypedEntries: cell("fromTypedEntries"),
      typedMap: cell("typedMap"),
      objectMap: cell("objectMap"),
    },
    {
      makeEncodeToSmallcaps: cell("makeEncodeToSmallcaps"),
      makeDecodeFromSmallcaps: cell("makeDecodeFromSmallcaps"),
    },
    {
      makeMarshal: cell("makeMarshal"),
    },
    {
      stringify: cell("stringify"),
      parse: cell("parse"),
    },
    {
      decodeToJustin: cell("decodeToJustin"),
      passableAsJustin: cell("passableAsJustin"),
      qp: cell("qp"),
    },
    {
      recordNames: cell("recordNames"),
      recordValues: cell("recordValues"),
      zeroPad: cell("zeroPad"),
      makePassableKit: cell("makePassableKit"),
      makeEncodePassable: cell("makeEncodePassable"),
      makeDecodePassable: cell("makeDecodePassable"),
      isEncodedRemotable: cell("isEncodedRemotable"),
      passStylePrefixes: cell("passStylePrefixes"),
    },
    {
      compareByCodePoints: cell("compareByCodePoints"),
      compareNumerics: cell("compareNumerics"),
      getPassStyleCover: cell("getPassStyleCover"),
      makeComparatorKit: cell("makeComparatorKit"),
      comparatorMirrorImage: cell("comparatorMirrorImage"),
      compareRank: cell("compareRank"),
      compareAntiRank: cell("compareAntiRank"),
      isRankSorted: cell("isRankSorted"),
      assertRankSorted: cell("assertRankSorted"),
      sortByRank: cell("sortByRank"),
      getIndexCover: cell("getIndexCover"),
      FullRankCover: cell("FullRankCover"),
      coveredEntries: cell("coveredEntries"),
      unionRankCovers: cell("unionRankCovers"),
      intersectRankCovers: cell("intersectRankCovers"),
      makeFullOrderComparatorKit: cell("makeFullOrderComparatorKit"),
    },
    {
    },
    {
      QCLASS: cell("QCLASS"),
      makeMarshal: cell("makeMarshal"),
      stringify: cell("stringify"),
      parse: cell("parse"),
      decodeToJustin: cell("decodeToJustin"),
      passableAsJustin: cell("passableAsJustin"),
      qp: cell("qp"),
      makePassableKit: cell("makePassableKit"),
      makeEncodePassable: cell("makeEncodePassable"),
      makeDecodePassable: cell("makeDecodePassable"),
      isEncodedRemotable: cell("isEncodedRemotable"),
      zeroPad: cell("zeroPad"),
      recordNames: cell("recordNames"),
      recordValues: cell("recordValues"),
      compareNumerics: cell("compareNumerics"),
      compareByCodePoints: cell("compareByCodePoints"),
      assertRankSorted: cell("assertRankSorted"),
      compareRank: cell("compareRank"),
      isRankSorted: cell("isRankSorted"),
      sortByRank: cell("sortByRank"),
      compareAntiRank: cell("compareAntiRank"),
      makeFullOrderComparatorKit: cell("makeFullOrderComparatorKit"),
      getPassStyleCover: cell("getPassStyleCover"),
      intersectRankCovers: cell("intersectRankCovers"),
      unionRankCovers: cell("unionRankCovers"),
      deeplyFulfilled: cell("deeplyFulfilled"),
    },
    {
      nearTrapImpl: cell("nearTrapImpl"),
      makeTrap: cell("makeTrap"),
    },
    {
      makeFinalizingMap: cell("makeFinalizingMap"),
    },
    {
      makeDefaultCapTPImportExportTables: cell("makeDefaultCapTPImportExportTables"),
      makeCapTP: cell("makeCapTP"),
      E: cell("E"),
    },
    {
      makeLoopback: cell("makeLoopback"),
      E: cell("E"),
    },
    {
      MIN_DATA_BUFFER_LENGTH: cell("MIN_DATA_BUFFER_LENGTH"),
      TRANSFER_OVERHEAD_LENGTH: cell("TRANSFER_OVERHEAD_LENGTH"),
      MIN_TRANSFER_BUFFER_LENGTH: cell("MIN_TRANSFER_BUFFER_LENGTH"),
      makeAtomicsTrapHost: cell("makeAtomicsTrapHost"),
      makeAtomicsTrapGuest: cell("makeAtomicsTrapGuest"),
    },
    {
      Nat: cell("Nat"),
      makeLoopback: cell("makeLoopback"),
    },
    {
    },
    {
      E: cell("E"),
      Far: cell("Far"),
      getInterfaceOf: cell("getInterfaceOf"),
      passStyleOf: cell("passStyleOf"),
    },
    {
      assertNoDuplicates: cell("assertNoDuplicates"),
      confirmElements: cell("confirmElements"),
      assertElements: cell("assertElements"),
      coerceToElements: cell("coerceToElements"),
      makeSetOfElements: cell("makeSetOfElements"),
    },
    {
      assertNoDuplicateKeys: cell("assertNoDuplicateKeys"),
      confirmBagEntries: cell("confirmBagEntries"),
      assertBagEntries: cell("assertBagEntries"),
      coerceToBagEntries: cell("coerceToBagEntries"),
      makeBagOfEntries: cell("makeBagOfEntries"),
    },
    {
      confirmScalarKey: cell("confirmScalarKey"),
      isScalarKey: cell("isScalarKey"),
      assertScalarKey: cell("assertScalarKey"),
      confirmKey: cell("confirmKey"),
      isKey: cell("isKey"),
      assertKey: cell("assertKey"),
      confirmCopySet: cell("confirmCopySet"),
      isCopySet: cell("isCopySet"),
      assertCopySet: cell("assertCopySet"),
      getCopySetKeys: cell("getCopySetKeys"),
      everyCopySetKey: cell("everyCopySetKey"),
      makeCopySet: cell("makeCopySet"),
      confirmCopyBag: cell("confirmCopyBag"),
      isCopyBag: cell("isCopyBag"),
      assertCopyBag: cell("assertCopyBag"),
      getCopyBagEntries: cell("getCopyBagEntries"),
      everyCopyBagEntry: cell("everyCopyBagEntry"),
      makeCopyBag: cell("makeCopyBag"),
      makeCopyBagFromElements: cell("makeCopyBagFromElements"),
      confirmCopyMap: cell("confirmCopyMap"),
      isCopyMap: cell("isCopyMap"),
      assertCopyMap: cell("assertCopyMap"),
      getCopyMapKeys: cell("getCopyMapKeys"),
      getCopyMapValues: cell("getCopyMapValues"),
      getCopyMapEntryArray: cell("getCopyMapEntryArray"),
      getCopyMapEntries: cell("getCopyMapEntries"),
      everyCopyMapKey: cell("everyCopyMapKey"),
      everyCopyMapValue: cell("everyCopyMapValue"),
      copyMapKeySet: cell("copyMapKeySet"),
      makeCopyMap: cell("makeCopyMap"),
    },
    {
      makeIterator: cell("makeIterator"),
    },
    {
      makeArrayIterator: cell("makeArrayIterator"),
    },
    {
      generateCollectionPairEntries: cell("generateCollectionPairEntries"),
      makeCompareCollection: cell("makeCompareCollection"),
    },
    {
      setCompare: cell("setCompare"),
      bagCompare: cell("bagCompare"),
      compareKeys: cell("compareKeys"),
      keyLT: cell("keyLT"),
      keyLTE: cell("keyLTE"),
      keyEQ: cell("keyEQ"),
      keyGTE: cell("keyGTE"),
      keyGT: cell("keyGT"),
    },
    {
      elementsIsSuperset: cell("elementsIsSuperset"),
      elementsIsDisjoint: cell("elementsIsDisjoint"),
      elementsCompare: cell("elementsCompare"),
      elementsUnion: cell("elementsUnion"),
      elementsDisjointUnion: cell("elementsDisjointUnion"),
      elementsIntersection: cell("elementsIntersection"),
      elementsDisjointSubtract: cell("elementsDisjointSubtract"),
      setIsSuperset: cell("setIsSuperset"),
      setIsDisjoint: cell("setIsDisjoint"),
      setUnion: cell("setUnion"),
      setDisjointUnion: cell("setDisjointUnion"),
      setIntersection: cell("setIntersection"),
      setDisjointSubtract: cell("setDisjointSubtract"),
    },
    {
      bagIsSuperbag: cell("bagIsSuperbag"),
      bagIsDisjoint: cell("bagIsDisjoint"),
      bagUnion: cell("bagUnion"),
      bagIntersection: cell("bagIntersection"),
      bagDisjointSubtract: cell("bagDisjointSubtract"),
    },
    {
      throwLabeled: cell("throwLabeled"),
    },
    {
      applyLabelingError: cell("applyLabelingError"),
    },
    {
      fromUniqueEntries: cell("fromUniqueEntries"),
    },
    {
      listDifference: cell("listDifference"),
    },
    {
      defaultLimits: cell("defaultLimits"),
      confirmMatches: cell("confirmMatches"),
      confirmLabeledMatches: cell("confirmLabeledMatches"),
      matches: cell("matches"),
      mustMatch: cell("mustMatch"),
      assertPattern: cell("assertPattern"),
      isPattern: cell("isPattern"),
      getRankCover: cell("getRankCover"),
      M: cell("M"),
      kindOf: cell("kindOf"),
      containerHasSplit: cell("containerHasSplit"),
      AwaitArgGuardShape: cell("AwaitArgGuardShape"),
      isAwaitArgGuard: cell("isAwaitArgGuard"),
      assertAwaitArgGuard: cell("assertAwaitArgGuard"),
      RawGuardShape: cell("RawGuardShape"),
      isRawGuard: cell("isRawGuard"),
      assertRawGuard: cell("assertRawGuard"),
      SyncValueGuardShape: cell("SyncValueGuardShape"),
      SyncValueGuardListShape: cell("SyncValueGuardListShape"),
      ArgGuardListShape: cell("ArgGuardListShape"),
      MethodGuardPayloadShape: cell("MethodGuardPayloadShape"),
      MethodGuardShape: cell("MethodGuardShape"),
      assertMethodGuard: cell("assertMethodGuard"),
      InterfaceGuardPayloadShape: cell("InterfaceGuardPayloadShape"),
      InterfaceGuardShape: cell("InterfaceGuardShape"),
      assertInterfaceGuard: cell("assertInterfaceGuard"),
    },
    {
      getAwaitArgGuardPayload: cell("getAwaitArgGuardPayload"),
      getMethodGuardPayload: cell("getMethodGuardPayload"),
      getInterfaceGuardPayload: cell("getInterfaceGuardPayload"),
      getInterfaceMethodKeys: cell("getInterfaceMethodKeys"),
      getNamedMethodGuards: cell("getNamedMethodGuards"),
    },
    {
    },
    {
      isKey: cell("isKey"),
      assertKey: cell("assertKey"),
      assertScalarKey: cell("assertScalarKey"),
      isCopySet: cell("isCopySet"),
      assertCopySet: cell("assertCopySet"),
      makeCopySet: cell("makeCopySet"),
      getCopySetKeys: cell("getCopySetKeys"),
      isCopyBag: cell("isCopyBag"),
      assertCopyBag: cell("assertCopyBag"),
      makeCopyBag: cell("makeCopyBag"),
      makeCopyBagFromElements: cell("makeCopyBagFromElements"),
      getCopyBagEntries: cell("getCopyBagEntries"),
      isCopyMap: cell("isCopyMap"),
      assertCopyMap: cell("assertCopyMap"),
      makeCopyMap: cell("makeCopyMap"),
      getCopyMapEntries: cell("getCopyMapEntries"),
      coerceToElements: cell("coerceToElements"),
      coerceToBagEntries: cell("coerceToBagEntries"),
      bagCompare: cell("bagCompare"),
      setCompare: cell("setCompare"),
      compareKeys: cell("compareKeys"),
      keyLT: cell("keyLT"),
      keyLTE: cell("keyLTE"),
      keyEQ: cell("keyEQ"),
      keyGTE: cell("keyGTE"),
      keyGT: cell("keyGT"),
      elementsIsSuperset: cell("elementsIsSuperset"),
      elementsIsDisjoint: cell("elementsIsDisjoint"),
      elementsCompare: cell("elementsCompare"),
      elementsUnion: cell("elementsUnion"),
      elementsDisjointUnion: cell("elementsDisjointUnion"),
      elementsIntersection: cell("elementsIntersection"),
      elementsDisjointSubtract: cell("elementsDisjointSubtract"),
      setIsSuperset: cell("setIsSuperset"),
      setIsDisjoint: cell("setIsDisjoint"),
      setUnion: cell("setUnion"),
      setDisjointUnion: cell("setDisjointUnion"),
      setIntersection: cell("setIntersection"),
      setDisjointSubtract: cell("setDisjointSubtract"),
      bagIsSuperbag: cell("bagIsSuperbag"),
      bagUnion: cell("bagUnion"),
      bagIntersection: cell("bagIntersection"),
      bagDisjointSubtract: cell("bagDisjointSubtract"),
      M: cell("M"),
      getRankCover: cell("getRankCover"),
      isPattern: cell("isPattern"),
      assertPattern: cell("assertPattern"),
      matches: cell("matches"),
      mustMatch: cell("mustMatch"),
      isAwaitArgGuard: cell("isAwaitArgGuard"),
      assertAwaitArgGuard: cell("assertAwaitArgGuard"),
      isRawGuard: cell("isRawGuard"),
      assertRawGuard: cell("assertRawGuard"),
      assertMethodGuard: cell("assertMethodGuard"),
      assertInterfaceGuard: cell("assertInterfaceGuard"),
      kindOf: cell("kindOf"),
      containerHasSplit: cell("containerHasSplit"),
      getAwaitArgGuardPayload: cell("getAwaitArgGuardPayload"),
      getMethodGuardPayload: cell("getMethodGuardPayload"),
      getInterfaceGuardPayload: cell("getInterfaceGuardPayload"),
      getInterfaceMethodKeys: cell("getInterfaceMethodKeys"),
      getNamedMethodGuards: cell("getNamedMethodGuards"),
      listDifference: cell("listDifference"),
      objectMap: cell("objectMap"),
    },
    {
      GET_INTERFACE_GUARD: cell("GET_INTERFACE_GUARD"),
    },
    {
      defendPrototype: cell("defendPrototype"),
      defendPrototypeKit: cell("defendPrototypeKit"),
    },
    {
      initEmpty: cell("initEmpty"),
      defineExoClass: cell("defineExoClass"),
      defineExoClassKit: cell("defineExoClassKit"),
      makeExo: cell("makeExo"),
    },
    {
    },
    {
      GET_INTERFACE_GUARD: cell("GET_INTERFACE_GUARD"),
    },
    {
      padding: cell("padding"),
      alphabet64: cell("alphabet64"),
      monodu64: cell("monodu64"),
    },
    {
      jsEncodeBase64: cell("jsEncodeBase64"),
      encodeBase64: cell("encodeBase64"),
    },
    {
      jsDecodeBase64: cell("jsDecodeBase64"),
      decodeBase64: cell("decodeBase64"),
    },
    {
      encodeBase64: cell("encodeBase64"),
    },
    {
      btoa: cell("btoa"),
    },
    {
      decodeBase64: cell("decodeBase64"),
    },
    {
      atob: cell("atob"),
    },
    {
      encodeBase64: cell("encodeBase64"),
      decodeBase64: cell("decodeBase64"),
      btoa: cell("btoa"),
      atob: cell("atob"),
    },
    {
      encodeEnvelope: cell("encodeEnvelope"),
      encodeFrame: cell("encodeFrame"),
      decodeFrame: cell("decodeFrame"),
      decodeEnvelope: cell("decodeEnvelope"),
      readFrameFromStream: cell("readFrameFromStream"),
      writeFrameToStream: cell("writeFrameToStream"),
    },
    {
      textEncoder: cell("textEncoder"),
      textDecoder: cell("textDecoder"),
      silentReject: cell("silentReject"),
      markShouldTerminate: cell("markShouldTerminate"),
      installShouldTerminate: cell("installShouldTerminate"),
    },
    {
      makeXsNode: cell("makeXsNode"),
      installShouldTerminate: cell("installShouldTerminate"),
      markShouldTerminate: cell("markShouldTerminate"),
      silentReject: cell("silentReject"),
      textDecoder: cell("textDecoder"),
      textEncoder: cell("textEncoder"),
    },
    {
      makeQueue: cell("makeQueue"),
      makeStream: cell("makeStream"),
      makePipe: cell("makePipe"),
      pump: cell("pump"),
      prime: cell("prime"),
      mapReader: cell("mapReader"),
      mapWriter: cell("mapWriter"),
    },
    {
      makeRefIterator: cell("makeRefIterator"),
      makeRefReader: cell("makeRefReader"),
    },
    {
    },
  ];

  defineProperties(cells[5], getOwnPropertyDescriptors(cells[4]));

  defineProperties(cells[8], {"getMethodNames": { value: cells[7]["getMethodNames"] },"makeMessageBreakpointTester": { value: cells[6]["makeMessageBreakpointTester"] } });
  defineProperties(cells[22], getOwnPropertyDescriptors(cells[20]));
  defineProperties(cells[22], getOwnPropertyDescriptors(cells[21]));
  defineProperties(cells[34], getOwnPropertyDescriptors(cells[33]));
  defineProperties(cells[37], getOwnPropertyDescriptors(cells[35]));
  defineProperties(cells[37], getOwnPropertyDescriptors(cells[36]));

  defineProperties(cells[37], {"mapIterable": { value: cells[13]["mapIterable"] },"filterIterable": { value: cells[13]["filterIterable"] },"PASS_STYLE": { value: cells[10]["PASS_STYLE"] },"isObject": { value: cells[10]["isObject"] },"isPrimitive": { value: cells[10]["isPrimitive"] },"assertChecker": { value: cells[10]["assertChecker"] },"getTag": { value: cells[10]["getTag"] },"hasOwnPropertyOf": { value: cells[10]["hasOwnPropertyOf"] },"getErrorConstructor": { value: cells[15]["getErrorConstructor"] },"isErrorLike": { value: cells[15]["isErrorLike"] },"getInterfaceOf": { value: cells[11]["getInterfaceOf"] },"getRemotableMethodNames": { value: cells[11]["getRemotableMethodNames"] },"assertPassableSymbol": { value: cells[16]["assertPassableSymbol"] },"isPassableSymbol": { value: cells[16]["isPassableSymbol"] },"nameForPassableSymbol": { value: cells[16]["nameForPassableSymbol"] },"passableSymbolForName": { value: cells[16]["passableSymbolForName"] },"unpassableSymbolForName": { value: cells[16]["unpassableSymbolForName"] },"isWellFormedString": { value: cells[17]["isWellFormedString"] },"assertWellFormedString": { value: cells[17]["assertWellFormedString"] },"assertPassableString": { value: cells[17]["assertPassableString"] },"passStyleOf": { value: cells[28]["passStyleOf"] },"isPassable": { value: cells[28]["isPassable"] },"assertPassable": { value: cells[28]["assertPassable"] },"toPassableError": { value: cells[28]["toPassableError"] },"toThrowable": { value: cells[28]["toThrowable"] },"makeTagged": { value: cells[29]["makeTagged"] },"Remotable": { value: cells[12]["Remotable"] },"Far": { value: cells[12]["Far"] },"ToFarFunction": { value: cells[12]["ToFarFunction"] },"GET_METHOD_NAMES": { value: cells[12]["GET_METHOD_NAMES"] },"assertRecord": { value: cells[30]["assertRecord"] },"assertCopyArray": { value: cells[30]["assertCopyArray"] },"assertRemotable": { value: cells[30]["assertRemotable"] },"isRemotable": { value: cells[30]["isRemotable"] },"isRecord": { value: cells[30]["isRecord"] },"isCopyArray": { value: cells[30]["isCopyArray"] },"isAtom": { value: cells[30]["isAtom"] },"assertAtom": { value: cells[30]["assertAtom"] } });
  defineProperties(cells[47], getOwnPropertyDescriptors(cells[46]));
  defineProperties(cells[47], getOwnPropertyDescriptors(cells[37]));

  defineProperties(cells[47], {"QCLASS": { value: cells[38]["QCLASS"] },"makeMarshal": { value: cells[41]["makeMarshal"] },"stringify": { value: cells[42]["stringify"] },"parse": { value: cells[42]["parse"] },"decodeToJustin": { value: cells[43]["decodeToJustin"] },"passableAsJustin": { value: cells[43]["passableAsJustin"] },"qp": { value: cells[43]["qp"] },"makePassableKit": { value: cells[44]["makePassableKit"] },"makeEncodePassable": { value: cells[44]["makeEncodePassable"] },"makeDecodePassable": { value: cells[44]["makeDecodePassable"] },"isEncodedRemotable": { value: cells[44]["isEncodedRemotable"] },"zeroPad": { value: cells[44]["zeroPad"] },"recordNames": { value: cells[44]["recordNames"] },"recordValues": { value: cells[44]["recordValues"] },"compareNumerics": { value: cells[45]["compareNumerics"] },"compareByCodePoints": { value: cells[45]["compareByCodePoints"] },"assertRankSorted": { value: cells[45]["assertRankSorted"] },"compareRank": { value: cells[45]["compareRank"] },"isRankSorted": { value: cells[45]["isRankSorted"] },"sortByRank": { value: cells[45]["sortByRank"] },"compareAntiRank": { value: cells[45]["compareAntiRank"] },"makeFullOrderComparatorKit": { value: cells[45]["makeFullOrderComparatorKit"] },"getPassStyleCover": { value: cells[45]["getPassStyleCover"] },"intersectRankCovers": { value: cells[45]["intersectRankCovers"] },"unionRankCovers": { value: cells[45]["unionRankCovers"] },"deeplyFulfilled": { value: cells[37]["deeplyFulfilled"] } });
  defineProperties(cells[53], getOwnPropertyDescriptors(cells[52]));
  defineProperties(cells[53], getOwnPropertyDescriptors(cells[50]));
  defineProperties(cells[53], getOwnPropertyDescriptors(cells[47]));

  defineProperties(cells[53], {"Nat": { value: cells[0]["Nat"] },"makeLoopback": { value: cells[51]["makeLoopback"] } });
  defineProperties(cells[55], getOwnPropertyDescriptors(cells[54]));

  defineProperties(cells[55], {"E": { value: cells[34]["E"] },"Far": { value: cells[37]["Far"] },"getInterfaceOf": { value: cells[37]["getInterfaceOf"] },"passStyleOf": { value: cells[37]["passStyleOf"] } });
  defineProperties(cells[72], getOwnPropertyDescriptors(cells[71]));

  defineProperties(cells[72], {"isKey": { value: cells[58]["isKey"] },"assertKey": { value: cells[58]["assertKey"] },"assertScalarKey": { value: cells[58]["assertScalarKey"] },"isCopySet": { value: cells[58]["isCopySet"] },"assertCopySet": { value: cells[58]["assertCopySet"] },"makeCopySet": { value: cells[58]["makeCopySet"] },"getCopySetKeys": { value: cells[58]["getCopySetKeys"] },"isCopyBag": { value: cells[58]["isCopyBag"] },"assertCopyBag": { value: cells[58]["assertCopyBag"] },"makeCopyBag": { value: cells[58]["makeCopyBag"] },"makeCopyBagFromElements": { value: cells[58]["makeCopyBagFromElements"] },"getCopyBagEntries": { value: cells[58]["getCopyBagEntries"] },"isCopyMap": { value: cells[58]["isCopyMap"] },"assertCopyMap": { value: cells[58]["assertCopyMap"] },"makeCopyMap": { value: cells[58]["makeCopyMap"] },"getCopyMapEntries": { value: cells[58]["getCopyMapEntries"] },"coerceToElements": { value: cells[56]["coerceToElements"] },"coerceToBagEntries": { value: cells[57]["coerceToBagEntries"] },"bagCompare": { value: cells[62]["bagCompare"] },"setCompare": { value: cells[62]["setCompare"] },"compareKeys": { value: cells[62]["compareKeys"] },"keyLT": { value: cells[62]["keyLT"] },"keyLTE": { value: cells[62]["keyLTE"] },"keyEQ": { value: cells[62]["keyEQ"] },"keyGTE": { value: cells[62]["keyGTE"] },"keyGT": { value: cells[62]["keyGT"] },"elementsIsSuperset": { value: cells[63]["elementsIsSuperset"] },"elementsIsDisjoint": { value: cells[63]["elementsIsDisjoint"] },"elementsCompare": { value: cells[63]["elementsCompare"] },"elementsUnion": { value: cells[63]["elementsUnion"] },"elementsDisjointUnion": { value: cells[63]["elementsDisjointUnion"] },"elementsIntersection": { value: cells[63]["elementsIntersection"] },"elementsDisjointSubtract": { value: cells[63]["elementsDisjointSubtract"] },"setIsSuperset": { value: cells[63]["setIsSuperset"] },"setIsDisjoint": { value: cells[63]["setIsDisjoint"] },"setUnion": { value: cells[63]["setUnion"] },"setDisjointUnion": { value: cells[63]["setDisjointUnion"] },"setIntersection": { value: cells[63]["setIntersection"] },"setDisjointSubtract": { value: cells[63]["setDisjointSubtract"] },"bagIsSuperbag": { value: cells[64]["bagIsSuperbag"] },"bagUnion": { value: cells[64]["bagUnion"] },"bagIntersection": { value: cells[64]["bagIntersection"] },"bagDisjointSubtract": { value: cells[64]["bagDisjointSubtract"] },"M": { value: cells[69]["M"] },"getRankCover": { value: cells[69]["getRankCover"] },"isPattern": { value: cells[69]["isPattern"] },"assertPattern": { value: cells[69]["assertPattern"] },"matches": { value: cells[69]["matches"] },"mustMatch": { value: cells[69]["mustMatch"] },"isAwaitArgGuard": { value: cells[69]["isAwaitArgGuard"] },"assertAwaitArgGuard": { value: cells[69]["assertAwaitArgGuard"] },"isRawGuard": { value: cells[69]["isRawGuard"] },"assertRawGuard": { value: cells[69]["assertRawGuard"] },"assertMethodGuard": { value: cells[69]["assertMethodGuard"] },"assertInterfaceGuard": { value: cells[69]["assertInterfaceGuard"] },"kindOf": { value: cells[69]["kindOf"] },"containerHasSplit": { value: cells[69]["containerHasSplit"] },"getAwaitArgGuardPayload": { value: cells[70]["getAwaitArgGuardPayload"] },"getMethodGuardPayload": { value: cells[70]["getMethodGuardPayload"] },"getInterfaceGuardPayload": { value: cells[70]["getInterfaceGuardPayload"] },"getInterfaceMethodKeys": { value: cells[70]["getInterfaceMethodKeys"] },"getNamedMethodGuards": { value: cells[70]["getNamedMethodGuards"] },"listDifference": { value: cells[68]["listDifference"] },"objectMap": { value: cells[39]["objectMap"] } });
  defineProperties(cells[77], getOwnPropertyDescriptors(cells[75]));
  defineProperties(cells[77], getOwnPropertyDescriptors(cells[76]));

  defineProperties(cells[77], {"GET_INTERFACE_GUARD": { value: cells[73]["GET_INTERFACE_GUARD"] } });

  defineProperties(cells[81], {"encodeBase64": { value: cells[79]["encodeBase64"] } });

  defineProperties(cells[83], {"decodeBase64": { value: cells[80]["decodeBase64"] } });

  defineProperties(cells[85], {"encodeBase64": { value: cells[79]["encodeBase64"] },"decodeBase64": { value: cells[80]["decodeBase64"] },"btoa": { value: cells[82]["btoa"] },"atob": { value: cells[84]["atob"] } });

  const namespaces = cells.map(cells => freeze(create(null, {
    ...cells,
    // Make this appear like an ESM module namespace object.
    [Symbol.toStringTag]: {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    },
  })));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

function observeImports(map, importName, importIndex) {
  for (const [name, observers] of map.get(importName)) {
    const cell = cells[importIndex][name];
    if (cell === undefined) {
      throw new ReferenceError(`Cannot import name ${name} (has ${Object.getOwnPropertyNames(cells[importIndex]).join(', ')})`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}

  functors[0]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      ZERO_N: cells[0].ZERO_N.set,
      ONE_N: cells[0].ONE_N.set,
      isNat: cells[0].isNat.set,
      Nat: cells[0].Nat.set,
    },
    importMeta: {},
  });
  functors[1]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeHardener: cells[1].makeHardener.set,
    },
    importMeta: {},
  });
  functors[2]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeHardenerSelector: cells[2].makeHardenerSelector.set,
    },
    importMeta: {},
  });
  functors[3]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./make-hardener.js", 1);
      observeImports(map, "./make-selector.js", 2);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[3].default.set,
    },
    importMeta: {},
  });
  functors[4]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeEnvironmentCaptor: cells[4].makeEnvironmentCaptor.set,
      getEnvironmentOption: cells[4].getEnvironmentOption.set,
      getEnvironmentOptionsList: cells[4].getEnvironmentOptionsList.set,
      environmentOptionsListHas: cells[4].environmentOptionsListHas.set,
    },
    importMeta: {},
  });
  functors[5]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/env-options.js", 4);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[6]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 5);
    },
    liveVar: {
    },
    onceVar: {
      makeMessageBreakpointTester: cells[6].makeMessageBreakpointTester.set,
    },
    importMeta: {},
  });
  functors[7]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "./message-breakpoints.js", 6);
    },
    liveVar: {
    },
    onceVar: {
      getMethodNames: cells[7].getMethodNames.set,
      localApplyFunction: cells[7].localApplyFunction.set,
      localApplyMethod: cells[7].localApplyMethod.set,
      localGet: cells[7].localGet.set,
    },
    importMeta: {},
  });
  functors[8]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/local.js", 7);
      observeImports(map, "./src/message-breakpoints.js", 6);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[9]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      details: cells[9].details.set,
      Fail: cells[9].Fail.set,
      note: cells[9].note.set,
      quote: cells[9].quote.set,
      assert: cells[9].assert.set,
      bare: cells[9].bare.set,
      makeError: cells[9].makeError.set,
      b: cells[9].b.set,
      X: cells[9].X.set,
      q: cells[9].q.set,
      annotateError: cells[9].annotateError.set,
      redacted: cells[9].redacted.set,
      throwRedacted: cells[9].throwRedacted.set,
      hideAndHardenFunction: cells[9].hideAndHardenFunction.set,
    },
    importMeta: {},
  });
  functors[10]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      hasOwnPropertyOf: cells[10].hasOwnPropertyOf.set,
      isPrimitive: cells[10].isPrimitive.set,
      isObject: cells[10].isObject.set,
      isTypedArray: cells[10].isTypedArray.set,
      PASS_STYLE: cells[10].PASS_STYLE.set,
      assertChecker: cells[10].assertChecker.set,
      confirmOwnDataDescriptor: cells[10].confirmOwnDataDescriptor.set,
      getTag: cells[10].getTag.set,
      confirmPassStyle: cells[10].confirmPassStyle.set,
      confirmTagRecord: cells[10].confirmTagRecord.set,
      confirmFunctionTagRecord: cells[10].confirmFunctionTagRecord.set,
    },
    importMeta: {},
  });
  functors[11]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/eventual-send/utils.js", 8);
      observeImports(map, "./passStyle-helpers.js", 10);
    },
    liveVar: {
    },
    onceVar: {
      canBeMethod: cells[11].canBeMethod.set,
      getRemotableMethodNames: cells[11].getRemotableMethodNames.set,
      assertIface: cells[11].assertIface.set,
      getInterfaceOf: cells[11].getInterfaceOf.set,
      RemotableHelper: cells[11].RemotableHelper.set,
    },
    importMeta: {},
  });
  functors[12]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/eventual-send/utils.js", 8);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
      observeImports(map, "./remotable.js", 11);
    },
    liveVar: {
    },
    onceVar: {
      Remotable: cells[12].Remotable.set,
      GET_METHOD_NAMES: cells[12].GET_METHOD_NAMES.set,
      Far: cells[12].Far.set,
      ToFarFunction: cells[12].ToFarFunction.set,
    },
    importMeta: {},
  });
  functors[13]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "./make-far.js", 12);
    },
    liveVar: {
    },
    onceVar: {
      mapIterable: cells[13].mapIterable.set,
      filterIterable: cells[13].filterIterable.set,
    },
    importMeta: {},
  });
  functors[14]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[14].default.set,
    },
    importMeta: {},
  });
  functors[15]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/harden/is-noop.js", 14);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      makeRepairError: cells[15].makeRepairError.set,
      repairError: cells[15].repairError.set,
      getErrorConstructor: cells[15].getErrorConstructor.set,
      isErrorLike: cells[15].isErrorLike.set,
      confirmRecursivelyPassableErrorPropertyDesc: cells[15].confirmRecursivelyPassableErrorPropertyDesc.set,
      confirmRecursivelyPassableError: cells[15].confirmRecursivelyPassableError.set,
      ErrorHelper: cells[15].ErrorHelper.set,
    },
    importMeta: {},
  });
  functors[16]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      isPassableSymbol: cells[16].isPassableSymbol.set,
      assertPassableSymbol: cells[16].assertPassableSymbol.set,
      nameForPassableSymbol: cells[16].nameForPassableSymbol.set,
      passableSymbolForName: cells[16].passableSymbolForName.set,
      unpassableSymbolForName: cells[16].unpassableSymbolForName.set,
    },
    importMeta: {},
  });
  functors[17]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 5);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      isWellFormedString: cells[17].isWellFormedString.set,
      assertWellFormedString: cells[17].assertWellFormedString.set,
      assertPassableString: cells[17].assertPassableString.set,
    },
    importMeta: {},
  });
  functors[18]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      makeReleasingExecutorKit: cells[18].makeReleasingExecutorKit.set,
    },
    importMeta: {},
  });
  functors[19]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      race: cells[19].memoRace.set,
    },
    importMeta: {},
  });
  functors[20]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      isPromise: cells[20].isPromise.set,
    },
    importMeta: {},
  });
  functors[21]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[22]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "./src/promise-executor-kit.js", 18);
      observeImports(map, "./src/memo-race.js", 19);
      observeImports(map, "./src/is-promise.js", 20);
      observeImports(map, "./src/types.js", 21);
    },
    liveVar: {
    },
    onceVar: {
      makePromiseKit: cells[22].makePromiseKit.set,
      racePromises: cells[22].racePromises.set,
    },
    importMeta: {},
  });
  functors[23]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
    },
    liveVar: {
    },
    onceVar: {
      CopyArrayHelper: cells[23].CopyArrayHelper.set,
    },
    importMeta: {},
  });
  functors[24]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      ByteArrayHelper: cells[24].ByteArrayHelper.set,
    },
    importMeta: {},
  });
  functors[25]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
      observeImports(map, "./remotable.js", 11);
    },
    liveVar: {
    },
    onceVar: {
      CopyRecordHelper: cells[25].CopyRecordHelper.set,
    },
    importMeta: {},
  });
  functors[26]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
    },
    liveVar: {
    },
    onceVar: {
      TaggedHelper: cells[26].TaggedHelper.set,
    },
    importMeta: {},
  });
  functors[27]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/promise-kit", 22);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      isSafePromise: cells[27].isSafePromise.set,
      assertSafePromise: cells[27].assertSafePromise.set,
    },
    importMeta: {},
  });
  functors[28]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/promise-kit", 22);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
      observeImports(map, "./copyArray.js", 23);
      observeImports(map, "./byteArray.js", 24);
      observeImports(map, "./copyRecord.js", 25);
      observeImports(map, "./tagged.js", 26);
      observeImports(map, "./error.js", 15);
      observeImports(map, "./remotable.js", 11);
      observeImports(map, "./symbol.js", 16);
      observeImports(map, "./safe-promise.js", 27);
      observeImports(map, "./string.js", 17);
    },
    liveVar: {
    },
    onceVar: {
      PassStyleOfEndowmentSymbol: cells[28].PassStyleOfEndowmentSymbol.set,
      passStyleOf: cells[28].passStyleOf.set,
      assertPassable: cells[28].assertPassable.set,
      isPassable: cells[28].isPassable.set,
      toPassableError: cells[28].toPassableError.set,
      toThrowable: cells[28].toThrowable.set,
    },
    importMeta: {},
  });
  functors[29]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyle-helpers.js", 10);
      observeImports(map, "./passStyleOf.js", 28);
    },
    liveVar: {
    },
    onceVar: {
      makeTagged: cells[29].makeTagged.set,
    },
    importMeta: {},
  });
  functors[30]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./passStyleOf.js", 28);
    },
    liveVar: {
    },
    onceVar: {
      isCopyArray: cells[30].isCopyArray.set,
      isByteArray: cells[30].isByteArray.set,
      isRecord: cells[30].isRecord.set,
      isRemotable: cells[30].isRemotable.set,
      assertCopyArray: cells[30].assertCopyArray.set,
      assertByteArray: cells[30].assertByteArray.set,
      assertRecord: cells[30].assertRecord.set,
      assertRemotable: cells[30].assertRemotable.set,
      isAtom: cells[30].isAtom.set,
      assertAtom: cells[30].assertAtom.set,
    },
    importMeta: {},
  });
  functors[31]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 5);
    },
    liveVar: {
    },
    onceVar: {
      trackTurns: cells[31].trackTurns.set,
    },
    importMeta: {},
  });
  functors[32]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "./track-turns.js", 31);
      observeImports(map, "./message-breakpoints.js", 6);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[32].default.set,
    },
    importMeta: {},
  });
  functors[33]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[34]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./E.js", 32);
      observeImports(map, "./exports.js", 33);
    },
    liveVar: {
    },
    onceVar: {
      hp: cells[34].HandledPromise.set,
      E: cells[34].E.set,
    },
    importMeta: {},
  });
  functors[35]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/promise-kit", 22);
      observeImports(map, "./passStyle-helpers.js", 10);
      observeImports(map, "./passStyleOf.js", 28);
      observeImports(map, "./makeTagged.js", 29);
      observeImports(map, "./typeGuards.js", 30);
    },
    liveVar: {
    },
    onceVar: {
      deeplyFulfilled: cells[35].deeplyFulfilled.set,
    },
    importMeta: {},
  });
  functors[36]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[37]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/iter-helpers.js", 13);
      observeImports(map, "./src/passStyle-helpers.js", 10);
      observeImports(map, "./src/error.js", 15);
      observeImports(map, "./src/remotable.js", 11);
      observeImports(map, "./src/symbol.js", 16);
      observeImports(map, "./src/string.js", 17);
      observeImports(map, "./src/passStyleOf.js", 28);
      observeImports(map, "./src/makeTagged.js", 29);
      observeImports(map, "./src/make-far.js", 12);
      observeImports(map, "./src/typeGuards.js", 30);
      observeImports(map, "./src/deeplyFulfilled.js", 35);
      observeImports(map, "./src/types.js", 36);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[38]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      QCLASS: cells[38].QCLASS.set,
      makeEncodeToCapData: cells[38].makeEncodeToCapData.set,
      makeDecodeFromCapData: cells[38].makeDecodeFromCapData.set,
    },
    importMeta: {},
  });
  functors[39]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      typedEntries: cells[39].typedEntries.set,
      fromTypedEntries: cells[39].fromTypedEntries.set,
      typedMap: cells[39].typedMap.set,
      objectMap: cells[39].objectMap.set,
    },
    importMeta: {},
  });
  functors[40]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/nat", 0);
      observeImports(map, "@endo/pass-style", 37);
    },
    liveVar: {
    },
    onceVar: {
      makeEncodeToSmallcaps: cells[40].makeEncodeToSmallcaps.set,
      makeDecodeFromSmallcaps: cells[40].makeDecodeFromSmallcaps.set,
    },
    importMeta: {},
  });
  functors[41]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/nat", 0);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/common/object-map.js", 39);
      observeImports(map, "./encodeToCapData.js", 38);
      observeImports(map, "./encodeToSmallcaps.js", 40);
    },
    liveVar: {
    },
    onceVar: {
      makeMarshal: cells[41].makeMarshal.set,
    },
    importMeta: {},
  });
  functors[42]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./marshal.js", 41);
    },
    liveVar: {
    },
    onceVar: {
      stringify: cells[42].stringify.set,
      parse: cells[42].parse.set,
    },
    importMeta: {},
  });
  functors[43]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/nat", 0);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "./encodeToCapData.js", 38);
      observeImports(map, "./marshal.js", 41);
    },
    liveVar: {
    },
    onceVar: {
      decodeToJustin: cells[43].decodeToJustin.set,
      passableAsJustin: cells[43].passableAsJustin.set,
      qp: cells[43].qp.set,
    },
    importMeta: {},
  });
  functors[44]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/nat", 0);
      observeImports(map, "@endo/pass-style", 37);
    },
    liveVar: {
    },
    onceVar: {
      recordNames: cells[44].recordNames.set,
      recordValues: cells[44].recordValues.set,
      zeroPad: cells[44].zeroPad.set,
      makePassableKit: cells[44].makePassableKit.set,
      makeEncodePassable: cells[44].makeEncodePassable.set,
      makeDecodePassable: cells[44].makeDecodePassable.set,
      isEncodedRemotable: cells[44].isEncodedRemotable.set,
      passStylePrefixes: cells[44].passStylePrefixes.set,
    },
    importMeta: {},
  });
  functors[45]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/env-options", 5);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "./encodePassable.js", 44);
    },
    liveVar: {
    },
    onceVar: {
      compareByCodePoints: cells[45].compareByCodePoints.set,
      compareNumerics: cells[45].compareNumerics.set,
      getPassStyleCover: cells[45].getPassStyleCover.set,
      makeComparatorKit: cells[45].makeComparatorKit.set,
      comparatorMirrorImage: cells[45].comparatorMirrorImage.set,
      compareRank: cells[45].compareRank.set,
      compareAntiRank: cells[45].compareAntiRank.set,
      isRankSorted: cells[45].isRankSorted.set,
      assertRankSorted: cells[45].assertRankSorted.set,
      sortByRank: cells[45].sortByRank.set,
      getIndexCover: cells[45].getIndexCover.set,
      FullRankCover: cells[45].FullRankCover.set,
      coveredEntries: cells[45].coveredEntries.set,
      unionRankCovers: cells[45].unionRankCovers.set,
      intersectRankCovers: cells[45].intersectRankCovers.set,
      makeFullOrderComparatorKit: cells[45].makeFullOrderComparatorKit.set,
    },
    importMeta: {},
  });
  functors[46]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[47]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/encodeToCapData.js", 38);
      observeImports(map, "./src/marshal.js", 41);
      observeImports(map, "./src/marshal-stringify.js", 42);
      observeImports(map, "./src/marshal-justin.js", 43);
      observeImports(map, "./src/encodePassable.js", 44);
      observeImports(map, "./src/rankOrder.js", 45);
      observeImports(map, "./src/types.js", 46);
      observeImports(map, "@endo/pass-style", 37);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[48]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      nearTrapImpl: cells[48].nearTrapImpl.set,
      makeTrap: cells[48].makeTrap.set,
    },
    importMeta: {},
  });
  functors[49]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/pass-style", 37);
    },
    liveVar: {
    },
    onceVar: {
      makeFinalizingMap: cells[49].makeFinalizingMap.set,
    },
    importMeta: {},
  });
  functors[50]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/promise-kit", 22);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./trap.js", 48);
      observeImports(map, "./finalize.js", 49);
    },
    liveVar: {
        E: cells[50].E.set,
  },
    onceVar: {
      makeDefaultCapTPImportExportTables: cells[50].makeDefaultCapTPImportExportTables.set,
      makeCapTP: cells[50].makeCapTP.set,
    },
    importMeta: {},
  });
  functors[51]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "./captp.js", 50);
      observeImports(map, "./trap.js", 48);
      observeImports(map, "./finalize.js", 49);
    },
    liveVar: {
        E: cells[51].E.set,
  },
    onceVar: {
      makeLoopback: cells[51].makeLoopback.set,
    },
    importMeta: {},
  });
  functors[52]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      MIN_DATA_BUFFER_LENGTH: cells[52].MIN_DATA_BUFFER_LENGTH.set,
      TRANSFER_OVERHEAD_LENGTH: cells[52].TRANSFER_OVERHEAD_LENGTH.set,
      MIN_TRANSFER_BUFFER_LENGTH: cells[52].MIN_TRANSFER_BUFFER_LENGTH.set,
      makeAtomicsTrapHost: cells[52].makeAtomicsTrapHost.set,
      makeAtomicsTrapGuest: cells[52].makeAtomicsTrapGuest.set,
    },
    importMeta: {},
  });
  functors[53]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/nat", 0);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "./captp.js", 50);
      observeImports(map, "./loopback.js", 51);
      observeImports(map, "./atomics.js", 52);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[54]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[55]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "./exports.js", 54);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[56]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/marshal", 47);
    },
    liveVar: {
    },
    onceVar: {
      assertNoDuplicates: cells[56].assertNoDuplicates.set,
      confirmElements: cells[56].confirmElements.set,
      assertElements: cells[56].assertElements.set,
      coerceToElements: cells[56].coerceToElements.set,
      makeSetOfElements: cells[56].makeSetOfElements.set,
    },
    importMeta: {},
  });
  functors[57]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/marshal", 47);
    },
    liveVar: {
    },
    onceVar: {
      assertNoDuplicateKeys: cells[57].assertNoDuplicateKeys.set,
      confirmBagEntries: cells[57].confirmBagEntries.set,
      assertBagEntries: cells[57].assertBagEntries.set,
      coerceToBagEntries: cells[57].coerceToBagEntries.set,
      makeBagOfEntries: cells[57].makeBagOfEntries.set,
    },
    importMeta: {},
  });
  functors[58]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "./copySet.js", 56);
      observeImports(map, "./copyBag.js", 57);
    },
    liveVar: {
    },
    onceVar: {
      confirmScalarKey: cells[58].confirmScalarKey.set,
      isScalarKey: cells[58].isScalarKey.set,
      assertScalarKey: cells[58].assertScalarKey.set,
      confirmKey: cells[58].confirmKey.set,
      isKey: cells[58].isKey.set,
      assertKey: cells[58].assertKey.set,
      confirmCopySet: cells[58].confirmCopySet.set,
      isCopySet: cells[58].isCopySet.set,
      assertCopySet: cells[58].assertCopySet.set,
      getCopySetKeys: cells[58].getCopySetKeys.set,
      everyCopySetKey: cells[58].everyCopySetKey.set,
      makeCopySet: cells[58].makeCopySet.set,
      confirmCopyBag: cells[58].confirmCopyBag.set,
      isCopyBag: cells[58].isCopyBag.set,
      assertCopyBag: cells[58].assertCopyBag.set,
      getCopyBagEntries: cells[58].getCopyBagEntries.set,
      everyCopyBagEntry: cells[58].everyCopyBagEntry.set,
      makeCopyBag: cells[58].makeCopyBag.set,
      makeCopyBagFromElements: cells[58].makeCopyBagFromElements.set,
      confirmCopyMap: cells[58].confirmCopyMap.set,
      isCopyMap: cells[58].isCopyMap.set,
      assertCopyMap: cells[58].assertCopyMap.set,
      getCopyMapKeys: cells[58].getCopyMapKeys.set,
      getCopyMapValues: cells[58].getCopyMapValues.set,
      getCopyMapEntryArray: cells[58].getCopyMapEntryArray.set,
      getCopyMapEntries: cells[58].getCopyMapEntries.set,
      everyCopyMapKey: cells[58].everyCopyMapKey.set,
      everyCopyMapValue: cells[58].everyCopyMapValue.set,
      copyMapKeySet: cells[58].copyMapKeySet.set,
      makeCopyMap: cells[58].makeCopyMap.set,
    },
    importMeta: {},
  });
  functors[59]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      makeIterator: cells[59].makeIterator.set,
    },
    importMeta: {},
  });
  functors[60]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "./make-iterator.js", 59);
    },
    liveVar: {
    },
    onceVar: {
      makeArrayIterator: cells[60].makeArrayIterator.set,
    },
    importMeta: {},
  });
  functors[61]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "@endo/common/make-iterator.js", 59);
      observeImports(map, "@endo/common/make-array-iterator.js", 60);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      generateCollectionPairEntries: cells[61].generateCollectionPairEntries.set,
      makeCompareCollection: cells[61].makeCompareCollection.set,
    },
    importMeta: {},
  });
  functors[62]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./checkKey.js", 58);
      observeImports(map, "./keycollection-operators.js", 61);
    },
    liveVar: {
    },
    onceVar: {
      setCompare: cells[62].setCompare.set,
      bagCompare: cells[62].bagCompare.set,
      compareKeys: cells[62].compareKeys.set,
      keyLT: cells[62].keyLT.set,
      keyLTE: cells[62].keyLTE.set,
      keyEQ: cells[62].keyEQ.set,
      keyGTE: cells[62].keyGTE.set,
      keyGT: cells[62].keyGT.set,
    },
    importMeta: {},
  });
  functors[63]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./copySet.js", 56);
    },
    liveVar: {
    },
    onceVar: {
      elementsIsSuperset: cells[63].elementsIsSuperset.set,
      elementsIsDisjoint: cells[63].elementsIsDisjoint.set,
      elementsCompare: cells[63].elementsCompare.set,
      elementsUnion: cells[63].elementsUnion.set,
      elementsDisjointUnion: cells[63].elementsDisjointUnion.set,
      elementsIntersection: cells[63].elementsIntersection.set,
      elementsDisjointSubtract: cells[63].elementsDisjointSubtract.set,
      setIsSuperset: cells[63].setIsSuperset.set,
      setIsDisjoint: cells[63].setIsDisjoint.set,
      setUnion: cells[63].setUnion.set,
      setDisjointUnion: cells[63].setDisjointUnion.set,
      setIntersection: cells[63].setIntersection.set,
      setDisjointSubtract: cells[63].setDisjointSubtract.set,
    },
    importMeta: {},
  });
  functors[64]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./copyBag.js", 57);
    },
    liveVar: {
    },
    onceVar: {
      bagIsSuperbag: cells[64].bagIsSuperbag.set,
      bagIsDisjoint: cells[64].bagIsDisjoint.set,
      bagUnion: cells[64].bagUnion.set,
      bagIntersection: cells[64].bagIntersection.set,
      bagDisjointSubtract: cells[64].bagDisjointSubtract.set,
    },
    importMeta: {},
  });
  functors[65]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      throwLabeled: cells[65].throwLabeled.set,
    },
    importMeta: {},
  });
  functors[66]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/promise-kit", 22);
      observeImports(map, "./throw-labeled.js", 65);
    },
    liveVar: {
    },
    onceVar: {
      applyLabelingError: cells[66].applyLabelingError.set,
    },
    importMeta: {},
  });
  functors[67]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
    },
    liveVar: {
    },
    onceVar: {
      fromUniqueEntries: cells[67].fromUniqueEntries.set,
    },
    importMeta: {},
  });
  functors[68]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
    },
    liveVar: {
    },
    onceVar: {
      listDifference: cells[68].listDifference.set,
    },
    importMeta: {},
  });
  functors[69]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "@endo/common/apply-labeling-error.js", 66);
      observeImports(map, "@endo/common/from-unique-entries.js", 67);
      observeImports(map, "@endo/common/list-difference.js", 68);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "@endo/marshal", 47);
      observeImports(map, "../keys/compareKeys.js", 62);
      observeImports(map, "../keys/checkKey.js", 58);
      observeImports(map, "../keys/keycollection-operators.js", 61);
    },
    liveVar: {
    },
    onceVar: {
      defaultLimits: cells[69].defaultLimits.set,
      confirmMatches: cells[69].confirmMatches.set,
      confirmLabeledMatches: cells[69].confirmLabeledMatches.set,
      matches: cells[69].matches.set,
      mustMatch: cells[69].mustMatch.set,
      assertPattern: cells[69].assertPattern.set,
      isPattern: cells[69].isPattern.set,
      getRankCover: cells[69].getRankCover.set,
      M: cells[69].M.set,
      kindOf: cells[69].kindOf.set,
      containerHasSplit: cells[69].containerHasSplit.set,
      AwaitArgGuardShape: cells[69].AwaitArgGuardShape.set,
      isAwaitArgGuard: cells[69].isAwaitArgGuard.set,
      assertAwaitArgGuard: cells[69].assertAwaitArgGuard.set,
      RawGuardShape: cells[69].RawGuardShape.set,
      isRawGuard: cells[69].isRawGuard.set,
      assertRawGuard: cells[69].assertRawGuard.set,
      SyncValueGuardShape: cells[69].SyncValueGuardShape.set,
      SyncValueGuardListShape: cells[69].SyncValueGuardListShape.set,
      ArgGuardListShape: cells[69].ArgGuardListShape.set,
      MethodGuardPayloadShape: cells[69].MethodGuardPayloadShape.set,
      MethodGuardShape: cells[69].MethodGuardShape.set,
      assertMethodGuard: cells[69].assertMethodGuard.set,
      InterfaceGuardPayloadShape: cells[69].InterfaceGuardPayloadShape.set,
      InterfaceGuardShape: cells[69].InterfaceGuardShape.set,
      assertInterfaceGuard: cells[69].assertInterfaceGuard.set,
    },
    importMeta: {},
  });
  functors[70]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/common/object-map.js", 39);
      observeImports(map, "./patternMatchers.js", 69);
      observeImports(map, "../keys/checkKey.js", 58);
    },
    liveVar: {
    },
    onceVar: {
      getAwaitArgGuardPayload: cells[70].getAwaitArgGuardPayload.set,
      getMethodGuardPayload: cells[70].getMethodGuardPayload.set,
      getInterfaceGuardPayload: cells[70].getInterfaceGuardPayload.set,
      getInterfaceMethodKeys: cells[70].getInterfaceMethodKeys.set,
      getNamedMethodGuards: cells[70].getNamedMethodGuards.set,
    },
    importMeta: {},
  });
  functors[71]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[72]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/keys/checkKey.js", 58);
      observeImports(map, "./src/keys/copySet.js", 56);
      observeImports(map, "./src/keys/copyBag.js", 57);
      observeImports(map, "./src/keys/compareKeys.js", 62);
      observeImports(map, "./src/keys/merge-set-operators.js", 63);
      observeImports(map, "./src/keys/merge-bag-operators.js", 64);
      observeImports(map, "./src/patterns/patternMatchers.js", 69);
      observeImports(map, "./src/patterns/getGuardPayloads.js", 70);
      observeImports(map, "./types-index.js", 71);
      observeImports(map, "@endo/common/list-difference.js", 68);
      observeImports(map, "@endo/common/object-map.js", 39);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[73]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      GET_INTERFACE_GUARD: cells[73].GET_INTERFACE_GUARD.set,
    },
    importMeta: {},
  });
  functors[74]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/pass-style", 37);
      observeImports(map, "@endo/patterns", 72);
      observeImports(map, "@endo/common/list-difference.js", 68);
      observeImports(map, "@endo/common/object-map.js", 39);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./get-interface.js", 73);
    },
    liveVar: {
    },
    onceVar: {
      defendPrototype: cells[74].defendPrototype.set,
      defendPrototypeKit: cells[74].defendPrototypeKit.set,
    },
    importMeta: {},
  });
  functors[75]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/common/object-map.js", 39);
      observeImports(map, "@endo/env-options", 5);
      observeImports(map, "@endo/errors", 9);
      observeImports(map, "./exo-tools.js", 74);
    },
    liveVar: {
    },
    onceVar: {
      initEmpty: cells[75].initEmpty.set,
      defineExoClass: cells[75].defineExoClass.set,
      defineExoClassKit: cells[75].defineExoClassKit.set,
      makeExo: cells[75].makeExo.set,
    },
    importMeta: {},
  });
  functors[76]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[77]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/exo-makers.js", 75);
      observeImports(map, "./src/types.js", 76);
      observeImports(map, "./src/get-interface.js", 73);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[78]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      padding: cells[78].padding.set,
      alphabet64: cells[78].alphabet64.set,
      monodu64: cells[78].monodu64.set,
    },
    importMeta: {},
  });
  functors[79]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./common.js", 78);
    },
    liveVar: {
    },
    onceVar: {
      jsEncodeBase64: cells[79].jsEncodeBase64.set,
      encodeBase64: cells[79].encodeBase64.set,
    },
    importMeta: {},
  });
  functors[80]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./common.js", 78);
    },
    liveVar: {
    },
    onceVar: {
      jsDecodeBase64: cells[80].jsDecodeBase64.set,
      decodeBase64: cells[80].decodeBase64.set,
    },
    importMeta: {},
  });
  functors[81]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/encode.js", 79);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[82]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./encode.js", 81);
    },
    liveVar: {
    },
    onceVar: {
      btoa: cells[82].btoa.set,
    },
    importMeta: {},
  });
  functors[83]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/decode.js", 80);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[84]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./decode.js", 83);
    },
    liveVar: {
    },
    onceVar: {
      atob: cells[84].atob.set,
    },
    importMeta: {},
  });
  functors[85]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/encode.js", 79);
      observeImports(map, "./src/decode.js", 80);
      observeImports(map, "./btoa.js", 82);
      observeImports(map, "./atob.js", 84);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[86]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      encodeEnvelope: cells[86].encodeEnvelope.set,
      encodeFrame: cells[86].encodeFrame.set,
      decodeFrame: cells[86].decodeFrame.set,
      decodeEnvelope: cells[86].decodeEnvelope.set,
      readFrameFromStream: cells[86].readFrameFromStream.set,
      writeFrameToStream: cells[86].writeFrameToStream.set,
    },
    importMeta: {},
  });
  functors[87]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      textEncoder: cells[87].textEncoder.set,
      textDecoder: cells[87].textDecoder.set,
      silentReject: cells[87].silentReject.set,
      markShouldTerminate: cells[87].markShouldTerminate.set,
      installShouldTerminate: cells[87].installShouldTerminate.set,
    },
    importMeta: {},
  });
  functors[88]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./envelope.js", 86);
      observeImports(map, "./bus-xs-common.js", 87);
    },
    liveVar: {
        installShouldTerminate: cells[88].installShouldTerminate.set,
      markShouldTerminate: cells[88].markShouldTerminate.set,
      silentReject: cells[88].silentReject.set,
      textDecoder: cells[88].textDecoder.set,
      textEncoder: cells[88].textEncoder.set,
  },
    onceVar: {
      makeXsNode: cells[88].makeXsNode.set,
    },
    importMeta: {},
  });
  functors[89]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/eventual-send", 34);
      observeImports(map, "@endo/promise-kit", 22);
    },
    liveVar: {
    },
    onceVar: {
      makeQueue: cells[89].makeQueue.set,
      makeStream: cells[89].makeStream.set,
      makePipe: cells[89].makePipe.set,
      pump: cells[89].pump.set,
      prime: cells[89].prime.set,
      mapReader: cells[89].mapReader.set,
      mapWriter: cells[89].mapWriter.set,
    },
    importMeta: {},
  });
  functors[90]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 3);
      observeImports(map, "@endo/base64", 85);
      observeImports(map, "@endo/stream", 89);
      observeImports(map, "@endo/far", 55);
    },
    liveVar: {
    },
    onceVar: {
      makeRefIterator: cells[90].makeRefIterator.set,
      makeRefReader: cells[90].makeRefReader.set,
    },
    importMeta: {},
  });
  functors[91]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/captp", 53);
      observeImports(map, "@endo/far", 55);
      observeImports(map, "@endo/exo", 77);
      observeImports(map, "@endo/patterns", 72);
      observeImports(map, "@endo/base64", 85);
      observeImports(map, "./bus-xs-core.js", 88);
      observeImports(map, "./ref-reader.js", 90);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });

  return cells[cells.length - 1]['*'].get();
})([
// === 0. nat ./src/index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-check

/**
 * Regarding Google Apps Script limitations,
 * https://www.google.com/search?q=what+version+of+ecmascript+does+apps+script+support&oq=what+version+of+ecmascript+does+apps+script+support&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRg7MgYIAhBFGDsyBggDEEUYOzIGCAQQLhhA0gEHODg4ajBqMagCALACAA&sourceid=chrome&ie=UTF-8
 * at one point said
 * > Literal syntax limitation: The shortcut syntax for `BigInt` literals
 * > (e.g., `10n`) is not supported by the script editor’s parser,
 * > and will cause a syntax error. You must use the `BigInt()` constructor
 * > with a string argument instead (e.g., `BigInt("10"))`.
 * Actually, when a number is accurate, we can use that instead of a string.
 *
 * Endo is not in general trying for compat with Apps Script. But packages that
 * will have minimal dependencies after adapting to
 * https://github.com/endojs/endo/pull/3008
 * might, such as `@endo/marshal` and `@endo/ocapn`.
 */
       const ZERO_N = BigInt(0);
/**
 * Regarding Google Apps Script limitations,
 * https://www.google.com/search?q=what+version+of+ecmascript+does+apps+script+support&oq=what+version+of+ecmascript+does+apps+script+support&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRg7MgYIAhBFGDsyBggDEEUYOzIGCAQQLhhA0gEHODg4ajBqMagCALACAA&sourceid=chrome&ie=UTF-8
 * at one point said
 * > Literal syntax limitation: The shortcut syntax for `BigInt` literals
 * > (e.g., `10n`) is not supported by the script editor’s parser,
 * > and will cause a syntax error. You must use the `BigInt()` constructor
 * > with a string argument instead (e.g., `BigInt("10"))`.
 * Actually, when a number is accurate, we can use that instead of a string.
 *
 * Endo is not in general trying for compat with Apps Script. But packages that
 * will have minimal dependencies after adapting to
 * https://github.com/endojs/endo/pull/3008
 * might, such as `@endo/marshal` and `@endo/ocapn`.
 */$h͏_once.ZERO_N(ZERO_N);
       const ONE_N = BigInt(1);

/**
 * Use as a standin for `harden` until https://github.com/endojs/endo/pull/3008
 * Since we're only using it on unadorned arrow functions, `freeze` in this
 * case is actually equivalent to `harden`.
 */$h͏_once.ONE_N(ONE_N);
const { freeze } = Object;

/**
 * Is `allegedNum` a number in the [contiguous range of exactly and
 * unambiguously
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 *  natural numbers (non-negative integers)?
 *
 * To qualify `allegedNum` must either be a
 * non-negative `bigint`, or a non-negative `number` representing an integer
 * within range of [integers safely representable in
 * floating point](https://tc39.es/ecma262/#sec-number.issafeinteger).
 *
 * @param {unknown} allegedNum
 * @returns {boolean}
 */
       const isNat = allegedNum => {
  if (typeof allegedNum === 'bigint') {
    return allegedNum >= 0;
  }
  if (typeof allegedNum !== 'number') {
    return false;
  }

  return Number.isSafeInteger(allegedNum) && allegedNum >= 0;
};$h͏_once.isNat(isNat);
freeze(isNat);

/**
 * If `allegedNumber` passes the `isNat` test, then return it as a bigint.
 * Otherwise throw an appropriate error.
 *
 * If `allegedNum` is neither a bigint nor a number, `Nat` throws a `TypeError`.
 * Otherwise, if it is not a [safely
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 * non-negative integer, `Nat` throws a `RangeError`.
 * Otherwise, it is converted to a bigint if necessary and returned.
 *
 * @param {unknown} allegedNum
 * @returns {bigint}
 */
       const Nat = allegedNum => {
  if (typeof allegedNum === 'bigint') {
    if (allegedNum < ZERO_N) {
      throw RangeError(`${allegedNum} is negative`);
    }
    return allegedNum;
  }

  if (typeof allegedNum === 'number') {
    if (!Number.isSafeInteger(allegedNum)) {
      throw RangeError(`${allegedNum} is not a safe integer`);
    }
    if (allegedNum < 0) {
      throw RangeError(`${allegedNum} is negative`);
    }
    return BigInt(allegedNum);
  }

  throw TypeError(
    `${allegedNum} is a ${typeof allegedNum} but must be a bigint or a number`,
  );
};$h͏_once.Nat(Nat);
freeze(Nat);
})()
,
// === 1. harden ./make-hardener.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// based upon:
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
// then copied from proposal-frozen-realms deep-freeze.js
// then copied from SES/src/bundle/deepFreeze.js

// @ts-check

/* global globalThis */

const {
  Array,
  JSON,
  Number,
  Object,
  Reflect,
  Set,
  String,
  Symbol,
  Uint8Array,
  WeakSet,
} = globalThis;

const {
  // The feral Error constructor is safe for internal use, but must not be
  // revealed to post-lockdown code in any compartment including the start
  // compartment since in V8 at least it bears stack inspection capabilities.
  Error: FERAL_ERROR,
  TypeError,
} = globalThis;

const {
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  prototype: objectPrototype,
  preventExtensions,
} = Object;

const { toStringTag: toStringTagSymbol } = Symbol;

const { isInteger } = Number;

const { stringify: stringifyJson } = JSON;

// Needed only for the Safari bug workaround below
const { defineProperty: originalDefineProperty } = Object;

const defineProperty = (object, prop, descriptor) => {
  // We used to do the following, until we had to reopen Safari bug
  // https://bugs.webkit.org/show_bug.cgi?id=222538#c17
  // Once this is fixed, we may restore it.
  // // Object.defineProperty is allowed to fail silently so we use
  // // Object.defineProperties instead.
  // return defineProperties(object, { [prop]: descriptor });

  // Instead, to workaround the Safari bug
  const result = originalDefineProperty(object, prop, descriptor);
  if (result !== object) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DEFINE_PROPERTY_FAILED_SILENTLY.md
    throw TypeError(
      `Please report that the original defineProperty silently failed to set ${stringifyJson(
        String(prop),
      )}. (SES_DEFINE_PROPERTY_FAILED_SILENTLY)`,
    );
  }
  return result;
};

const { apply, ownKeys } = Reflect;

const { prototype: arrayPrototype } = Array;
const { prototype: setPrototype } = Set;
const { prototype: weaksetPrototype } = WeakSet;
const { prototype: functionPrototype } = Function;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);

const { bind } = functionPrototype;

/**
 * uncurryThis()
 * Equivalent of: fn => (thisArg, ...args) => apply(fn, thisArg, args)
 *
 * See those reference for a complete explanation:
 * http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 * which only lives at
 * http://web.archive.org/web/20160805225710/http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 *
 * @type {<F extends (this: any, ...args: any[]) => any>(fn: F) => ((thisArg: ThisParameterType<F>, ...args: Parameters<F>) => ReturnType<F>)}
 */
const uncurryThis = bind.bind(bind.call); // eslint-disable-line @endo/no-polymorphic-call

// See https://github.com/endojs/endo/issues/2930
if (!('hasOwn' in Object)) {
  const ObjectPrototypeHasOwnProperty = objectPrototype.hasOwnProperty;
  const hasOwnShim = (obj, key) => {
    if (obj === undefined || obj === null) {
      // We need to add this extra test because of differences in
      // the order in which `hasOwn` vs `hasOwnProperty` validates
      // arguments.
      throw TypeError('Cannot convert undefined or null to object');
    }
    return apply(ObjectPrototypeHasOwnProperty, obj, [key]);
  };
  defineProperty(Object, 'hasOwn', {
    value: hasOwnShim,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

const { hasOwn } = Object;

const arrayForEach = uncurryThis(arrayPrototype.forEach);
//
const setAdd = uncurryThis(setPrototype.add);
const setForEach = uncurryThis(setPrototype.forEach);
const setHas = uncurryThis(setPrototype.has);

const weaksetAdd = uncurryThis(weaksetPrototype.add);
const weaksetHas = uncurryThis(weaksetPrototype.has);

/**
 * TODO Consolidate with `isPrimitive` that's currently in `@endo/pass-style`
 * and also `ses`.
 * Layering constraints make this tricky, which is why we haven't yet figured
 * out how to do this.
 *
 * @type {(val: unknown) => val is (undefined
 * | null
 * | boolean
 * | number
 * | bigint
 * | string
 * | symbol)}
 */
const isPrimitive = val =>
  !val || (typeof val !== 'object' && typeof val !== 'function');

/**
 * isError tests whether an object inherits from the intrinsic
 * `Error.prototype`.
 * We capture the original error constructor as FERAL_ERROR to provide a clear
 * signal for reviewers that we are handling an object with excess authority,
 * like stack trace inspection, that we are carefully hiding from client code.
 * Checking instanceof happens to be safe, but to avoid uttering FERAL_ERROR
 * for such a trivial case outside commons.js, we provide a utility function.
 *
 * @param {any} value
 */
const isError = value => value instanceof FERAL_ERROR;

// ////////////////// FERAL_STACK_GETTER FERAL_STACK_SETTER ////////////////////

// The error repair mechanism is very similar to code in ses/src/commons.js
// and these implementations should be kept in sync.

const makeTypeError = () => {
  try {
    // @ts-expect-error deliberate TypeError
    null.null;
    throw TypeError('obligatory'); // To convince the type flow inferrence.
  } catch (error) {
    return error;
  }
};

const typeErrorStackDesc = getOwnPropertyDescriptor(makeTypeError(), 'stack');
const errorStackDesc = getOwnPropertyDescriptor(Error('obligatory'), 'stack');

let feralStackGetter;
let feralStackSetter;

if (typeErrorStackDesc !== undefined && typeErrorStackDesc.get !== undefined) {
  // We should only encounter this case on v8 because of its problematic
  // error own stack accessor behavior.
  // Note that FF/SpiderMonkey, Moddable/XS, and the error stack proposal
  // all inherit a stack accessor property from Error.prototype, which is
  // great. That case needs no heroics to secure.
  if (
    // In the v8 case as we understand it, all errors have an own stack
    // accessor property, but within the same realm, all these accessor
    // properties have the same getter and have the same setter.
    // This is therefore the case that we repair.
    errorStackDesc !== undefined &&
    typeof typeErrorStackDesc.get === 'function' &&
    typeErrorStackDesc.get === errorStackDesc.get &&
    typeof typeErrorStackDesc.set === 'function' &&
    typeErrorStackDesc.set === errorStackDesc.set
  ) {
    // Otherwise, we have own stack accessor properties that are outside
    // our expectations, that therefore need to be understood better
    // before we know how to repair them.
    feralStackGetter = freeze(typeErrorStackDesc.get);
    feralStackSetter = freeze(typeErrorStackDesc.set);
  } else {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR.md
    throw TypeError(
      'Unexpected Error own stack accessor functions (SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)',
    );
  }
}

/**
 * If on a v8 with the problematic error own stack accessor behavior,
 * `FERAL_STACK_GETTER` will be the shared getter of all those accessors
 * and `FERAL_STACK_SETTER` will be the shared setter. On any platform
 * without this problem, `FERAL_STACK_GETTER` and `FERAL_STACK_SETTER` are
 * both `undefined`.
 *
 * @type {(() => any) | undefined}
 */
const FERAL_STACK_GETTER = feralStackGetter;

/**
 * If on a v8 with the problematic error own stack accessor behavior,
 * `FERAL_STACK_GETTER` will be the shared getter of all those accessors
 * and `FERAL_STACK_SETTER` will be the shared setter. On any platform
 * without this problem, `FERAL_STACK_GETTER` and `FERAL_STACK_SETTER` are
 * both `undefined`.
 *
 * @type {((newValue: any) => void) | undefined}
 */
const FERAL_STACK_SETTER = feralStackSetter;

/** @type {(condition: any) => asserts condition} */
const assert = condition => {
  if (!condition) {
    throw new TypeError('assertion failed');
  }
};

/**
 * @template T
 * @typedef {(value: T) => T} Harden
 */

// Obtain the string tag accessor of of TypedArray so we can indirectly use the
// TypedArray brand check it employs.
const typedArrayToStringTag = getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol,
);
assert(typedArrayToStringTag);
const getTypedArrayToStringTag = typedArrayToStringTag.get;
assert(getTypedArrayToStringTag);

// Exported for tests.
/**
 * Duplicates packages/marshal/src/helpers/passStyle-helpers.js to avoid a dependency.
 *
 * @param {unknown} object
 */
const isTypedArray = object => {
  // The object must pass a brand check or toStringTag will return undefined.
  const tag = apply(getTypedArrayToStringTag, object, []);
  return tag !== undefined;
};

/**
 * Tests if a property key is an integer-valued canonical numeric index.
 * https://tc39.es/ecma262/#sec-canonicalnumericindexstring
 *
 * @param {string | symbol} propertyKey
 */
const isCanonicalIntegerIndexString = propertyKey => {
  const n = +String(propertyKey);
  return isInteger(n) && String(n) === propertyKey;
};

/**
 * @template T
 * @param {ArrayLike<T>} array
 */
const freezeTypedArray = array => {
  preventExtensions(array);

  // Downgrade writable expandos to readonly, even if non-configurable.
  // We get each descriptor individually rather than using
  // getOwnPropertyDescriptors in order to fail safe when encountering
  // an obscure GraalJS issue where getOwnPropertyDescriptor returns
  // undefined for a property that does exist.
  arrayForEach(ownKeys(array), (/** @type {string | symbol} */ name) => {
    const desc = getOwnPropertyDescriptor(array, name);
    assert(desc);
    // TypedArrays are integer-indexed exotic objects, which define special
    // treatment for property names in canonical numeric form:
    // integers in range are permanently writable and non-configurable.
    // https://tc39.es/ecma262/#sec-integer-indexed-exotic-objects
    //
    // This is analogous to the data of a hardened Map or Set,
    // so we carve out this exceptional behavior but make all other
    // properties non-configurable.
    if (!isCanonicalIntegerIndexString(name)) {
      defineProperty(array, name, {
        ...desc,
        writable: false,
        configurable: false,
      });
    }
  });
};

/**
 * Create a `harden` function.
 *
 * @template T
 * @param {object} [args]
 * @param {boolean} [args.traversePrototypes]
 * @returns {Harden<T>}
 */
       const makeHardener = ({ traversePrototypes = false } = {}) => {
  const hardened = new WeakSet();

  const { harden } = {
    /**
     * @template T
     * @param {T} root
     * @returns {T}
     */
    harden(root) {
      const toFreeze = new Set();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      /**
       * @param {any} val
       */
      function enqueue(val) {
        if (isPrimitive(val)) {
          // ignore primitives
          return;
        }
        const type = typeof val;
        if (type !== 'object' && type !== 'function') {
          // future proof: break until someone figures out what it should do
          throw TypeError(`Unexpected typeof: ${type}`);
        }
        if (weaksetHas(hardened, val) || setHas(toFreeze, val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.warn(`adding ${val} to toFreeze`, val);
        setAdd(toFreeze, val);
      }

      /**
       * @param {any} obj
       */
      const baseFreezeAndTraverse = obj => {
        // Now freeze the object to ensure reactive
        // objects such as proxies won't add properties
        // during traversal, before they get frozen.

        // Object are verified before being enqueued,
        // therefore this is a valid candidate.
        // Throws if this fails (strict mode).
        // Also throws if the object is an ArrayBuffer or any TypedArray.
        if (isTypedArray(obj)) {
          freezeTypedArray(obj);
        } else {
          freeze(obj);
        }

        // we rely upon certain commitments of Object.freeze and proxies here

        // get stable/immutable outbound links before a Proxy has a chance to do
        // something sneaky.
        const descs = getOwnPropertyDescriptors(obj);
        if (traversePrototypes) {
          const proto = getPrototypeOf(obj);
          enqueue(proto);
        }

        arrayForEach(ownKeys(descs), (/** @type {string | symbol} */ name) => {
          // The 'name' may be a symbol, and TypeScript doesn't like us to
          // index arbitrary symbols on objects, so we pretend they're just
          // strings.
          const desc = descs[/** @type {string} */ (name)];
          // getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that
          // this is a data property.
          if (hasOwn(desc, 'value')) {
            enqueue(desc.value);
          } else {
            enqueue(desc.get);
            enqueue(desc.set);
          }
        });
      };

      const freezeAndTraverse =
        FERAL_STACK_GETTER === undefined && FERAL_STACK_SETTER === undefined
          ? // On platforms without v8's error own stack accessor problem,
            // don't pay for any extra overhead.
            baseFreezeAndTraverse
          : obj => {
              if (isError(obj)) {
                // Only pay the overhead if it first passes this cheap isError
                // check. Otherwise, it will be unrepaired, but won't be judged
                // to be a passable error anyway, so will not be unsafe.
                const stackDesc = getOwnPropertyDescriptor(obj, 'stack');
                if (
                  stackDesc &&
                  stackDesc.get === FERAL_STACK_GETTER &&
                  stackDesc.configurable
                ) {
                  // Can only repair if it is configurable. Otherwise, leave
                  // unrepaired, in which case it will not be judged passable,
                  // avoiding a safety problem.
                  defineProperty(obj, 'stack', {
                    // NOTE: Calls getter during harden, which seems dangerous.
                    // But we're only calling the problematic getter whose
                    // hazards we think we understand.
                    // @ts-expect-error TS should know FERAL_STACK_GETTER
                    // cannot be `undefined` here.
                    // See https://github.com/endojs/endo/pull/2232#discussion_r1575179471
                    value: apply(FERAL_STACK_GETTER, obj, []),
                  });
                }
              }
              return baseFreezeAndTraverse(obj);
            };

      const dequeue = () => {
        // New values added before forEach() has finished will be visited.
        setForEach(toFreeze, freezeAndTraverse);
      };

      /** @param {any} value */
      const markHardened = value => {
        weaksetAdd(hardened, value);
      };

      const commit = () => {
        setForEach(toFreeze, markHardened);
      };

      enqueue(root);
      dequeue();
      // console.warn("toFreeze set:", toFreeze);
      commit();

      return root;
    },
  };

  return harden;
};$h͏_once.makeHardener(makeHardener);
})()
,
// === 2. harden ./make-selector.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);/* This module provides the mechanism used by both the "unsafe" and "shallow"
 * (default) implementations of "@endo/harden" for racing to install an
 * implementation of harden at globalThis.harden and
 * Object[Symbol.for('harden')].
 */

/* global globalThis */

/** @import { Harden } from './make-hardener.js' */

const symbolForHarden = Symbol.for('harden');

/**
 * @template T
 * @param {() => Harden<T>} makeHardener
 */
       const makeHardenerSelector = makeHardener => {
  const selectHarden = () => {
    // @ts-expect-error Type 'unique symbol' cannot be used as an index type.
    const { [symbolForHarden]: objectHarden } = Object;
    if (objectHarden) {
      if (typeof objectHarden !== 'function') {
        throw new Error('@endo/harden expected callable Object[@harden]');
      }
      return objectHarden;
    }

    // @ts-ignore globalThis.harden is a HardenedJS convention
    const { harden: globalHarden } = globalThis;
    if (globalHarden) {
      if (typeof globalHarden !== 'function') {
        throw new Error('@endo/harden expected callable globalThis.harden');
      }
      return globalHarden;
    }

    const harden = makeHardener();
    // We should not reach this point if a harden implementation already exists here.
    // The non-configurability of this property will prevent any HardenedJS's
    // lockdown from succeeding.
    // Versions that predate the introduction of Object[@harden] will be unable
    // to remove the unknown intrinsic.
    // Versions that permit Object[@harden] fail explicitly.
    Object.defineProperty(Object, symbolForHarden, {
      value: harden,
      configurable: false,
      writable: false,
    });

    return harden;
  };

  let selectedHarden;

  /**
   * @template T
   * @param {T} object
   * @returns {T}
   */
  const harden = object => {
    if (!selectedHarden) {
      selectedHarden = selectHarden();
    }
    return selectedHarden(object);
  };
  Object.freeze(harden);

  return harden;
};$h͏_once.makeHardenerSelector(makeHardenerSelector);
})()
,
// === 3. harden ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let makeHardener,makeHardenerSelector;$h͏_imports([["./make-hardener.js", [["makeHardener",[$h͏_a => (makeHardener = $h͏_a)]]]],["./make-selector.js", [["makeHardenerSelector",[$h͏_a => (makeHardenerSelector = $h͏_a)]]]]]);












const harden = makeHardenerSelector(() =>
  makeHardener({ traversePrototypes: false }),
);
const{default:$c͏_default}={default:harden};$h͏_once.default($c͏_default);
})()
,
// === 4. env-options ./src/env-options.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);/* global globalThis */
// @ts-check

// `@endo/env-options` needs to be imported quite early, and so should
// avoid importing from ses or anything that depends on ses.

// /////////////////////////////////////////////////////////////////////////////
// Prelude of cheap good - enough imitations of things we'd use or
// do differently if we could depend on ses

// eslint-disable-next-line no-restricted-globals
const localThis = globalThis;

const { Object, Reflect, Array, String, JSON, Error } = localThis;
const { freeze } = Object;
const { apply } = Reflect;

// Should be equivalent to the one in ses' commons.js even though it
// uses the other technique.
const uncurryThis =
  fn =>
  (receiver, ...args) =>
    apply(fn, receiver, args);
const arrayPush = uncurryThis(Array.prototype.push);
const arrayIncludes = uncurryThis(Array.prototype.includes);
const stringSplit = uncurryThis(String.prototype.split);

const q = JSON.stringify;

const Fail = (literals, ...args) => {
  let msg = literals[0];
  for (let i = 0; i < args.length; i += 1) {
    msg = `${msg}${args[i]}${literals[i + 1]}`;
  }
  throw Error(msg);
};

// end prelude
// /////////////////////////////////////////////////////////////////////////////

/**
 * `makeEnvironmentCaptor` provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {object} aGlobal
 * @param {boolean} [dropNames] Defaults to false. If true, don't track
 * names used.
 */
       const makeEnvironmentCaptor = (aGlobal, dropNames = false) => {
  /** @type {string[]} */
  const capturedEnvironmentOptionNames = [];

  /**
   * Gets an environment option by name and returns the option value or the
   * given default.
   *
   * @param {string} optionName
   * @param {string} defaultSetting
   * @param {string[]} [optOtherValues]
   * If provided, the option value must be included or match `defaultSetting`.
   * @returns {string}
   */
  const getEnvironmentOption = (
    optionName,
    defaultSetting,
    optOtherValues = undefined,
  ) => {
    typeof optionName === 'string' ||
      Fail`Environment option name ${q(optionName)} must be a string.`;
    typeof defaultSetting === 'string' ||
      Fail`Environment option default setting ${q(
        defaultSetting,
      )} must be a string.`;

    /** @type {string} */
    let setting = defaultSetting;
    const globalProcess = aGlobal.process || undefined;
    const globalEnv =
      (typeof globalProcess === 'object' && globalProcess.env) || undefined;
    if (typeof globalEnv === 'object') {
      if (optionName in globalEnv) {
        if (!dropNames) {
          arrayPush(capturedEnvironmentOptionNames, optionName);
        }
        const optionValue = globalEnv[optionName];
        // eslint-disable-next-line @endo/no-polymorphic-call
        typeof optionValue === 'string' ||
          Fail`Environment option named ${q(
            optionName,
          )}, if present, must have a corresponding string value, got ${q(
            optionValue,
          )}`;
        setting = optionValue;
      }
    }
    optOtherValues === undefined ||
      setting === defaultSetting ||
      arrayIncludes(optOtherValues, setting) ||
      Fail`Unrecognized ${q(optionName)} value ${q(
        setting,
      )}. Expected one of ${q([defaultSetting, ...optOtherValues])}`;
    return setting;
  };
  freeze(getEnvironmentOption);

  /**
   * @template {string} [T=string]
   * @param {string} optionName
   * @returns {T[]}
   */
  const getEnvironmentOptionsList = optionName => {
    const option = getEnvironmentOption(optionName, '');
    return freeze(option === '' ? [] : stringSplit(option, ','));
  };
  freeze(getEnvironmentOptionsList);

  /**
   * @template {string} [T=string]
   * @param {string} optionName
   * @param {T} element
   * @returns {boolean}
   */
  const environmentOptionsListHas = (optionName, element) =>
    arrayIncludes(getEnvironmentOptionsList(optionName), element);

  const getCapturedEnvironmentOptionNames = () => {
    return freeze([...capturedEnvironmentOptionNames]);
  };
  freeze(getCapturedEnvironmentOptionNames);

  return freeze({
    getEnvironmentOption,
    getEnvironmentOptionsList,
    environmentOptionsListHas,
    getCapturedEnvironmentOptionNames,
  });
};$h͏_once.makeEnvironmentCaptor(makeEnvironmentCaptor);
freeze(makeEnvironmentCaptor);

/**
 * For the simple case, where the global in question is `globalThis` and no
 * reporting of option names is desired.
 */
       const {
  getEnvironmentOption,
  getEnvironmentOptionsList,
  environmentOptionsListHas,
} = makeEnvironmentCaptor(localThis, true);$h͏_once.getEnvironmentOption(getEnvironmentOption);$h͏_once.getEnvironmentOptionsList(getEnvironmentOptionsList);$h͏_once.environmentOptionsListHas(environmentOptionsListHas);
})()
,
// === 5. env-options ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/env-options.js", []]]);
})()
,
// === 6. eventual-send ./src/message-breakpoints.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let getEnvironmentOption;$h͏_imports([["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getEnvironmentOption = $h͏_a)]]]]]);

const { quote: q, Fail } = assert;

const { hasOwn, freeze, entries } = Object;

/**
 * @typedef {string | '*'} MatchStringTag
 *   A star `'*'` matches any recipient. Otherwise, the string is
 *   matched against the value of a recipient's `@@toStringTag`
 *   after stripping out any leading `'Alleged: '` or `'DebugName: '`
 *   prefix. For objects defined with `Far` this is the first argument,
 *   known as the `farName`. For exos, this is the tag.
 */
/**
 * @typedef {string | '*'} MatchMethodName
 *   A star `'*'` matches any method name. Otherwise, the string is
 *   matched against the method name. Currently, this is only an exact match.
 *   However, beware that we may introduce a string syntax for
 *   symbol method names.
 */
/**
 * @typedef {number | '*'} MatchCountdown
 *   A star `'*'` will always breakpoint. Otherwise, the string
 *   must be a non-negative integer. Once that is zero, always breakpoint.
 *   Otherwise decrement by one each time it matches until it reaches zero.
 *   In other words, the countdown represents the number of
 *   breakpoint occurrences to skip before actually breakpointing.
 */

/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchStringTag, Record<MatchMethodName, MatchCountdown>>} MessageBreakpoints
 */

/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchMethodName, Record<MatchStringTag, MatchCountdown>>} BreakpointTable
 */

/**
 * @typedef {object} MessageBreakpointTester
 * @property {() => MessageBreakpoints} getBreakpoints
 * @property {(newBreakpoints?: MessageBreakpoints) => void} setBreakpoints
 * @property {(
 *   recipient: object,
 *   methodName: string | symbol | undefined
 * ) => boolean} shouldBreakpoint
 */

/**
 * @param {any} val
 * @returns {val is Record<string, any>}
 */
const isJSONRecord = val =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

/**
 * Return `tag` after stripping off any `'Alleged: '` or `'DebugName: '`
 * prefix if present.
 * ```js
 * simplifyTag('Alleged: moola issuer') === 'moola issuer'
 * ```
 * If there are multiple such prefixes, only the outer one is removed.
 *
 * @param {string} tag
 * @returns {string}
 */
const simplifyTag = tag => {
  for (const prefix of ['Alleged: ', 'DebugName: ']) {
    if (tag.startsWith(prefix)) {
      return tag.slice(prefix.length);
    }
  }
  return tag;
};

/**
 * @param {string} optionName
 * @returns {MessageBreakpointTester | undefined}
 */
       const makeMessageBreakpointTester = optionName => {
  let breakpoints = JSON.parse(getEnvironmentOption(optionName, 'null'));

  if (breakpoints === null) {
    return undefined;
  }

  /** @type {BreakpointTable} */
  let breakpointsTable;

  const getBreakpoints = () => breakpoints;
  freeze(getBreakpoints);

  const setBreakpoints = (newBreakpoints = breakpoints) => {
    isJSONRecord(newBreakpoints) ||
      Fail`Expected ${q(optionName)} option to be a JSON breakpoints record`;

    /** @type {BreakpointTable} */
    // @ts-expect-error confused by __proto__
    const newBreakpointsTable = { __proto__: null };

    for (const [tag, methodBPs] of entries(newBreakpoints)) {
      tag === simplifyTag(tag) ||
        Fail`Just use simple tag ${q(simplifyTag(tag))} rather than ${q(tag)}`;
      isJSONRecord(methodBPs) ||
        Fail`Expected ${q(optionName)} option's ${q(
          tag,
        )} to be a JSON methods breakpoints record`;
      for (const [methodName, count] of entries(methodBPs)) {
        count === '*' ||
          (typeof count === 'number' &&
            Number.isSafeInteger(count) &&
            count >= 0) ||
          Fail`Expected ${q(optionName)} option's ${q(tag)}.${q(
            methodName,
          )} to be "*" or a non-negative integer`;

        const classBPs = hasOwn(newBreakpointsTable, methodName)
          ? newBreakpointsTable[methodName]
          : (newBreakpointsTable[methodName] = {
              // @ts-expect-error confused by __proto__
              __proto__: null,
            });
        classBPs[tag] = count;
      }
    }
    breakpoints = newBreakpoints;
    breakpointsTable = newBreakpointsTable;
  };
  freeze(setBreakpoints);

  const shouldBreakpoint = (recipient, methodName) => {
    if (methodName === undefined || methodName === null) {
      // TODO enable function breakpointing
      return false;
    }
    const classBPs = breakpointsTable[methodName] || breakpointsTable['*'];
    if (classBPs === undefined) {
      return false;
    }
    let tag = simplifyTag(recipient[Symbol.toStringTag]);
    let count = classBPs[tag];
    if (count === undefined) {
      tag = '*';
      count = classBPs[tag];
      if (count === undefined) {
        return false;
      }
    }
    if (count === '*') {
      return true;
    }
    if (count === 0) {
      return true;
    }
    assert(typeof count === 'number' && count >= 1);
    classBPs[tag] = count - 1;
    return false;
  };
  freeze(shouldBreakpoint);

  const breakpointTester = freeze({
    getBreakpoints,
    setBreakpoints,
    shouldBreakpoint,
  });
  breakpointTester.setBreakpoints();
  return breakpointTester;
};$h͏_once.makeMessageBreakpointTester(makeMessageBreakpointTester);
freeze(makeMessageBreakpointTester);
})()
,
// === 7. eventual-send ./src/local.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,makeMessageBreakpointTester;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./message-breakpoints.js", [["makeMessageBreakpointTester",[$h͏_a => (makeMessageBreakpointTester = $h͏_a)]]]]]);


const { details: X, quote: q, Fail } = assert;

const { getOwnPropertyDescriptors, getPrototypeOf, freeze } = Object;
const { apply, ownKeys } = Reflect;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

const onDelivery = makeMessageBreakpointTester('ENDO_DELIVERY_BREAKPOINTS');

/**
 * TODO Consolidate with `isPrimitive` that's currently in `@endo/pass-style`.
 * Layering constraints make this tricky, which is why we haven't yet figured
 * out how to do this.
 *
 * @type {(val: unknown) => val is (undefined
 * | null
 * | boolean
 * | number
 * | bigint
 * | string
 * | symbol)}
 */
const isPrimitive = val =>
  !val || (typeof val !== 'object' && typeof val !== 'function');

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified = (a, b) => {
  if (typeof a === typeof b) {
    const left = String(a);
    const right = String(b);
    // eslint-disable-next-line no-nested-ternary
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof a === 'symbol') {
    assert(typeof b === 'string');
    return -1;
  }
  assert(typeof a === 'string');
  assert(typeof b === 'symbol');
  return 1;
};

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
       const getMethodNames = val => {
  let layer = val;
  const names = new Set(); // Set to deduplicate
  while (layer !== null && layer !== Object.prototype) {
    // be tolerant of non-objects
    const descs = getOwnPropertyDescriptors(layer);
    for (const name of ownKeys(descs)) {
      // In case a method is overridden by a non-method,
      // test `val[name]` rather than `layer[name]`
      if (typeof val[name] === 'function') {
        names.add(name);
      }
    }
    if (isPrimitive(val)) {
      break;
    }
    layer = getPrototypeOf(layer);
  }
  return harden([...names].sort(compareStringified));
};
// The top level of the eventual send modules can be evaluated before
// ses creates `harden`, and so cannot rely on `harden` at top level.
$h͏_once.getMethodNames(getMethodNames);freeze(getMethodNames);

       const localApplyFunction = (recipient, args) => {
  typeof recipient === 'function' ||
    assert.fail(
      X`Cannot invoke target as a function; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, undefined)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual function call
    // so that you can step *into* the following `apply` in order to see the
    // function call as it happens. Or step *over* to see what happens
    // after the function call returns.
  }
  const result = apply(recipient, undefined, args);
  return result;
};$h͏_once.localApplyFunction(localApplyFunction);

       const localApplyMethod = (recipient, methodName, args) => {
  if (methodName === undefined || methodName === null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(recipient, args);
  }
  if (recipient === undefined || recipient === null) {
    assert.fail(
      X`Cannot deliver ${q(methodName)} to target; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  }
  const fn = recipient[methodName];
  if (fn === undefined) {
    assert.fail(
      X`target has no method ${q(methodName)}, has ${q(
        getMethodNames(recipient),
      )}`,
      TypeError,
    );
  }
  const ftype = ntypeof(fn);
  typeof fn === 'function' ||
    Fail`invoked method ${q(methodName)} is not a function; it is a ${q(
      ftype,
    )}`;
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, methodName)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual method call
    // so that you can step *into* the following `apply` in order to see the
    // method call as it happens. Or step *over* to see what happens
    // after the method call returns.
  }
  const result = apply(fn, recipient, args);
  return result;
};$h͏_once.localApplyMethod(localApplyMethod);

       const localGet = (t, key) => t[key];$h͏_once.localGet(localGet);
})()
,
// === 8. eventual-send ./utils.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/local.js", []],["./src/message-breakpoints.js", []]]);
})()
,
// === 9. errors ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);














const { defineProperty } = Object;

const globalAssert = globalThis.assert;

if (globalAssert === undefined) {
  throw Error(
    `Cannot initialize @endo/errors, missing globalThis.assert, import 'ses' before '@endo/errors'`,
  );
}

const missing = [
  'typeof',
  'fail',
  'equal',
  'string',
  'note',
  'details',
  'Fail',
  'quote',
  // As of 2025-07, the Agoric chain's bootstrap vat runs with a version of SES
  // that predates addition of the 'bare' and 'makeError' methods, so we must
  // tolerate their absence and fall back to other behavior in that environment
  // (see below).
  // 'bare',
  // 'makeError',
  'makeAssert',
].filter(name => globalAssert[name] === undefined);
if (globalAssert.makeError === undefined && globalAssert.error === undefined) {
  missing.push('makeError');
}
if (missing.length > 0) {
  throw Error(
    `Cannot initialize @endo/errors, missing globalThis.assert methods ${missing.join(
      ', ',
    )}`,
  );
}

// The global assert mixed assertions and utility functions.
// This module splits them apart
// and also updates the names of the utility functions.
const {
  bare: globalBare,
  details,
  error: globalError,
  Fail,
  makeAssert: _omittedMakeAssert,
  makeError: globalMakeError,
  note,
  quote,
  ...assertions
} = globalAssert;
/** @type {import("ses").AssertionFunctions } */
// @ts-expect-error missing properties assigned next
$h͏_once.details(details);$h͏_once.Fail(Fail);$h͏_once.note(note);$h͏_once.quote(quote);const assert=(value,optDetails,errContructor,options)=>
  globalAssert(value, optDetails, errContructor, options);$h͏_once.assert(assert);
Object.assign(assert, assertions);

// As of 2025-07, the Agoric chain's bootstrap vat runs with a version of SES
// that predates the addition of the 'bare' and 'makeError' methods, so we must
// fall back to 'quote' for the former and 'error' for the latter.
const bare = globalBare || quote;$h͏_once.bare(bare);
const makeError = globalMakeError || globalError;

// XXX module exports fail if these aren't in scope
/** @import {AssertMakeErrorOptions, Details, GenericErrorConstructor} from 'ses' */$h͏_once.makeError(makeError);













// conventional abbreviations
       const b = bare;$h͏_once.b(b);
       const X = details;$h͏_once.X(X);
       const q = quote;

// other aliases
$h͏_once.q(q);const annotateError=note;$h͏_once.annotateError(annotateError);
       const redacted = details;$h͏_once.redacted(redacted);
       const throwRedacted = Fail;

/**
 * `stackFiltering: 'omit-frames'` and `stackFiltering: 'concise'` omit frames
 * not only of "obvious" infrastructure functions, but also of functions
 * whose `name` property begins with `'__HIDE_'`. (Note: currently
 * these options only work on v8.)
 *
 * Given that `func` is not yet frozen, then `hideAndHardenFunction(func)`
 * will prifix `func.name` with an additional `'__HIDE_'`, so that under
 * those stack filtering options, frames for calls to such functions are
 * not reported.
 *
 * Then the function is hardened and returned. Thus, you can say
 * `hideAndHardenFunction(func)` where you would normally first say
 * `harden(func)`.
 *
 * @template {Function} [T=Function]
 * @param {T} func
 * @returns {T}
 */$h͏_once.throwRedacted(throwRedacted);
       const hideAndHardenFunction = func => {
  typeof func === 'function' || Fail`${func} must be a function`;
  const { name } = func;
  defineProperty(func, 'name', {
    // Use `String` in case `name` is a symbol.
    value: `__HIDE_${String(name)}`,
  });
  return harden(func);
};$h͏_once.hideAndHardenFunction(hideAndHardenFunction);
})()
,
// === 10. pass-style ./src/passStyle-helpers.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,q,hideAndHardenFunction;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);


/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Checker, PassStyle, JSPrimitive} from './types.js';
 */

const { isArray } = Array;
const { prototype: functionPrototype } = Function;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  hasOwn,
  isFrozen,
  prototype: objectPrototype,
} = Object;
const { apply } = Reflect;
const { toStringTag: toStringTagSymbol } = Symbol;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
const typedArrayToStringTagDesc = getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol,
);
assert(typedArrayToStringTagDesc);
const getTypedArrayToStringTag = typedArrayToStringTagDesc.get;
assert(typeof getTypedArrayToStringTag === 'function');

/**
 * @deprecated Use `Object.hasOwn` instead
 */
       const hasOwnPropertyOf = hasOwn;

/**
 * @type {(val: unknown) => val is JSPrimitive}
 */$h͏_once.hasOwnPropertyOf(hasOwnPropertyOf);
       const isPrimitive = val =>
  // Safer would be `Object(val) !== val` but is too expensive on XS.
  // So instead we use this adhoc set of type tests. But this is not safe in
  // the face of possible evolution of the language. Beware!
  !val || (typeof val !== 'object' && typeof val !== 'function');$h͏_once.isPrimitive(isPrimitive);
hideAndHardenFunction(isPrimitive);

// NOTE: Do not make this type more precise because it breaks only clients
// that rely on it being less precise.
/**
 * @deprecated use `!isPrimitive` instead
 * @param {any} val
 * @returns {boolean}
 */
       const isObject = val =>
  // Safer would be `Object(val) -== val` but is too expensive on XS.
  // So instead we use this adhoc set of type tests. But this is not safe in
  // the face of possible evolution of the language. Beware!
  !!val && (typeof val === 'object' || typeof val === 'function');$h͏_once.isObject(isObject);
hideAndHardenFunction(isObject);

/**
 * Duplicates packages/ses/src/make-hardener.js to avoid a dependency.
 *
 * @param {unknown} object
 */
       const isTypedArray = object => {
  // The object must pass a brand check or toStringTag will return undefined.
  const tag = apply(getTypedArrayToStringTag, object, []);
  return tag !== undefined;
};$h͏_once.isTypedArray(isTypedArray);
hideAndHardenFunction(isTypedArray);

       const PASS_STYLE = Symbol.for('passStyle');

/**
 * Below we have a series of predicate functions and their (curried) assertion
 * functions. The semantics of the assertion function is just to assert that
 * the corresponding predicate function would have returned true. But it
 * reproduces the internal tests so failures can give a better error message.
 *
 * @deprecated Use `Fail` with confirm/reject pattern instead
 * @type {Checker}
 */$h͏_once.PASS_STYLE(PASS_STYLE);
       const assertChecker = (cond, details) => {
  assert(cond, details);
  return true;
};$h͏_once.assertChecker(assertChecker);
hideAndHardenFunction(assertChecker);

/**
 * Verifies the presence and enumerability of an own data property
 * and returns its descriptor.
 *
 * @param {object} candidate
 * @param {string|number|symbol} propName
 * @param {boolean} shouldBeEnumerable
 * @param {Rejector} reject
 * @returns {PropertyDescriptor}
 */
       const confirmOwnDataDescriptor = (
  candidate,
  propName,
  shouldBeEnumerable,
  reject,
) => {
  const desc = /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(candidate, propName)
  );
  return (desc !== undefined ||
    (reject && reject`${q(propName)} property expected: ${candidate}`)) &&
    (hasOwn(desc, 'value') ||
      (reject &&
        reject`${q(propName)} must not be an accessor property: ${candidate}`)) &&
    (shouldBeEnumerable
      ? desc.enumerable ||
        (reject &&
          reject`${q(propName)} must be an enumerable property: ${candidate}`)
      : !desc.enumerable ||
        (reject &&
          reject`${q(propName)} must not be an enumerable property: ${candidate}`))
    ? desc
    : /** @type {PropertyDescriptor} */ (/** @type {unknown} */ (undefined));
};$h͏_once.confirmOwnDataDescriptor(confirmOwnDataDescriptor);
harden(confirmOwnDataDescriptor);

/**
 * @template {import('./types.js').InterfaceSpec} T
 * @param {import('./types.js').PassStyled<any, T>} tagRecord
 * @returns {T}
 */
       const getTag = tagRecord => tagRecord[Symbol.toStringTag];$h͏_once.getTag(getTag);
harden(getTag);

/**
 * @param {any} obj
 * @param {PassStyle} passStyle
 * @param {PassStyle} expectedPassStyle
 * @param {Rejector} reject
 */
       const confirmPassStyle = (obj, passStyle, expectedPassStyle, reject) => {
  return (
    passStyle === expectedPassStyle ||
    (reject &&
      reject`Expected ${q(expectedPassStyle)}, not ${q(passStyle)}: ${obj}`)
  );
};$h͏_once.confirmPassStyle(confirmPassStyle);
harden(confirmPassStyle);

const makeConfirmTagRecord = confirmProto => {
  /**
   * @param {import('./types.js').PassStyled<any, any>} tagRecord
   * @param {PassStyle} expectedPassStyle
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmTagRecord = (tagRecord, expectedPassStyle, reject) => {
    return (
      (!isPrimitive(tagRecord) ||
        (reject && reject`A non-object cannot be a tagRecord: ${tagRecord}`)) &&
      (isFrozen(tagRecord) ||
        (reject && reject`A tagRecord must be frozen: ${tagRecord}`)) &&
      (!isArray(tagRecord) ||
        (reject && reject`An array cannot be a tagRecord: ${tagRecord}`)) &&
      confirmPassStyle(
        tagRecord,
        confirmOwnDataDescriptor(tagRecord, PASS_STYLE, false, reject)?.value,
        expectedPassStyle,
        reject,
      ) &&
      (typeof confirmOwnDataDescriptor(
        tagRecord,
        Symbol.toStringTag,
        false,
        reject,
      )?.value === 'string' ||
        (reject &&
          reject`A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`)) &&
      confirmProto(tagRecord, getPrototypeOf(tagRecord), reject)
    );
  };
  return harden(confirmTagRecord);
};

       const confirmTagRecord = makeConfirmTagRecord(
  (val, proto, reject) =>
    proto === objectPrototype ||
    (reject && reject`A tagRecord must inherit from Object.prototype: ${val}`),
);$h͏_once.confirmTagRecord(confirmTagRecord);
harden(confirmTagRecord);

       const confirmFunctionTagRecord = makeConfirmTagRecord(
  (val, proto, reject) =>
    proto === functionPrototype ||
    (proto !== null && getPrototypeOf(proto) === functionPrototype) ||
    (reject &&
      reject`For functions, a tagRecord must inherit from Function.prototype: ${val}`),
);$h͏_once.confirmFunctionTagRecord(confirmFunctionTagRecord);
harden(confirmFunctionTagRecord);
})()
,
// === 11. pass-style ./src/remotable.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,q,hideAndHardenFunction,getMethodNames,PASS_STYLE,confirmTagRecord,confirmFunctionTagRecord,isPrimitive,getTag;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/eventual-send/utils.js", [["getMethodNames",[$h͏_a => (getMethodNames = $h͏_a)]]]],["./passStyle-helpers.js", [["PASS_STYLE",[$h͏_a => (PASS_STYLE = $h͏_a)]],["confirmTagRecord",[$h͏_a => (confirmTagRecord = $h͏_a)]],["confirmFunctionTagRecord",[$h͏_a => (confirmFunctionTagRecord = $h͏_a)]],["isPrimitive",[$h͏_a => (isPrimitive = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]]]]]);










/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 * @import {InterfaceSpec, PassStyled, RemotableObject, RemotableMethodName} from './types.js';
 */

/**
 * For a function to be a valid method, it must not be passable.
 * Otherwise, we risk confusing pass-by-copy data carrying
 * far functions with attempts at far objects with methods.
 *
 * TODO HAZARD Because we check this on the way to hardening a remotable,
 * we cannot yet check that `func` is hardened. However, without
 * doing so, it's inheritance might change after the `PASS_STYLE`
 * check below.
 *
 * @param {any} func
 * @returns {func is CallableFunction}
 */
       const canBeMethod = func =>
  typeof func === 'function' && !(PASS_STYLE in func);$h͏_once.canBeMethod(canBeMethod);
harden(canBeMethod);

// TODO https://github.com/endojs/endo/issues/2884
// Abstract out canBeMethodName so later PRs agree on method name restrictions.

/**
 * @param {any} key
 * @returns {key is RemotableMethodName}
 */
const canBeMethodName = key =>
  // typeof key === 'string' || typeof key === 'symbol';
  typeof key === 'string' || typeof key === 'symbol' || typeof key === 'number';
harden(canBeMethodName);

/**
 * Uses the `getMethodNames` from the eventual-send level of abstraction that
 * does not know anything about remotables.
 *
 * Currently, just alias `getMethodNames` but this abstraction exists so
 * a future PR can enforce restrictions on method names of remotables.
 *
 * @template {Record<string, CallableFunction>} T
 * @param {T} behaviorMethods
 * @returns {RemotableMethodName[]}
 */
       const getRemotableMethodNames = behaviorMethods =>
  getMethodNames(behaviorMethods);$h͏_once.getRemotableMethodNames(getRemotableMethodNames);
harden(getRemotableMethodNames);

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getPrototypeOf,
  isFrozen,
  prototype: objectPrototype,
  getOwnPropertyDescriptors,
  hasOwn,
} = Object;

/**
 * @param {InterfaceSpec} iface
 * @param {Rejector} reject
 */
const confirmIface = (iface, reject) => {
  return (
    // TODO other possible ifaces, once we have third party veracity
    (typeof iface === 'string' ||
      (reject &&
        reject`For now, interface ${iface} must be a string; unimplemented`)) &&
    (iface === 'Remotable' ||
      iface.startsWith('Alleged: ') ||
      iface.startsWith('DebugName: ') ||
      (reject &&
        reject`For now, iface ${q(
          iface,
        )} must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented`))
  );
};

/**
 * An `iface` must be pure. Right now it must be a string, which is pure.
 * Later we expect to include some other values that qualify as `PureData`,
 * which is a pass-by-copy superstructure ending only in primitives or
 * empty pass-by-copy composites. No remotables, promises, or errors.
 * We *assume* for now that the pass-by-copy superstructure contains no
 * proxies.
 *
 * @param {InterfaceSpec} iface
 */
       const assertIface = iface => confirmIface(iface, Fail);$h͏_once.assertIface(assertIface);
hideAndHardenFunction(assertIface);

/**
 * @param {object | Function} original
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmRemotableProtoOf = (original, reject) => {
  !isPrimitive(original) ||
    Fail`Remotables must be objects or functions: ${original}`;

  // A valid remotable object must inherit from a "tag record" -- a
  // plain-object prototype consisting of only
  // a `PASS_STYLE` property with value "remotable" and a suitable `Symbol.toStringTag`
  // property. The remotable could inherit directly from such a tag record, or
  // it could inherit from another valid remotable, that therefore itself
  // inherits directly or indirectly from such a tag record.
  //
  // TODO: It would be nice to typedef this shape, but we can't declare a type
  // with PASS_STYLE from JSDoc.
  //
  // @type {{ [PASS_STYLE]: string,
  //          [Symbol.toStringTag]: string,
  //        }}
  //
  const proto = getPrototypeOf(original);
  if (
    proto === objectPrototype ||
    proto === null ||
    proto === Function.prototype
  ) {
    return (
      reject && reject`Remotables must be explicitly declared: ${q(original)}`
    );
  }

  if (typeof original === 'object') {
    const protoProto = getPrototypeOf(proto);
    if (protoProto !== objectPrototype && protoProto !== null) {
      // eslint-disable-next-line no-use-before-define
      return confirmRemotable(proto, reject);
    }
    if (!confirmTagRecord(proto, 'remotable', reject)) {
      return false;
    }
  } else if (typeof original === 'function') {
    if (!confirmFunctionTagRecord(proto, 'remotable', reject)) {
      return false;
    }
  }

  // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
  const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
  const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
  const {
    // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
    [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
    [/** @type {string} */ (tagKey)]: { value: iface },
    ...restDescs
  } = getOwnPropertyDescriptors(proto);

  return (
    (ownKeys(restDescs).length === 0 ||
      (reject &&
        reject`Unexpected properties on Remotable Proto ${ownKeys(restDescs)}`)) &&
    confirmIface(iface, reject)
  );
};

/**
 * Keep a weak set of confirmed remotables for marshal performance
 * (without which we would incur a redundant verification in
 * getInterfaceOf).
 * We don't remember rejections because they are possible to correct
 * with e.g. `harden`.
 *
 * @type {WeakSet<RemotableObject>}
 */
const confirmedRemotables = new WeakSet();

/**
 * @param {any} val
 * @param {Rejector} reject
 * @returns {val is RemotableObject}
 */
const confirmRemotable = (val, reject) => {
  if (confirmedRemotables.has(val)) {
    return true;
  }
  if (!isFrozen(val)) {
    return reject && reject`cannot serialize non-frozen objects like ${val}`;
  }
  // eslint-disable-next-line no-use-before-define
  if (!RemotableHelper.confirmCanBeValid(val, reject)) {
    return false;
  }
  const result = confirmRemotableProtoOf(val, reject);
  if (result) {
    confirmedRemotables.add(val);
  }
  return result;
};

/**
 * Simple semantics, just tell what interface spec a Remotable has,
 * or undefined if not deemed to be a Remotable.
 *
 * @type {{
 * <T extends string>(val: PassStyled<any, T>): T;
 * (val: any): InterfaceSpec | undefined;
 * }}
 */
       const getInterfaceOf = val => {
  if (
    isPrimitive(val) ||
    val[PASS_STYLE] !== 'remotable' ||
    !confirmRemotable(val, false)
  ) {
    // @ts-expect-error narrowed
    return undefined;
  }
  // @ts-expect-error narrowed
  return getTag(val);
};$h͏_once.getInterfaceOf(getInterfaceOf);
harden(getInterfaceOf);

/**
 *
 * @type {PassStyleHelper}
 */
       const RemotableHelper = harden({
  styleName: 'remotable',

  confirmCanBeValid: (candidate, reject) => {
    const validType =
      (!isPrimitive(candidate) ||
        (reject &&
          reject`cannot serialize non-objects as Remotable ${candidate}`)) &&
      (!isArray(candidate) ||
        (reject && reject`cannot serialize arrays as Remotable ${candidate}`));
    if (!validType) {
      return false;
    }

    const descs = getOwnPropertyDescriptors(candidate);
    if (typeof candidate === 'object') {
      // Every own property (regardless of enumerability)
      // must have a function value.
      return ownKeys(descs).every(key => {
        return (
          // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
          (hasOwn(descs[/** @type {string} */ (key)], 'value') ||
            (reject &&
              reject`cannot serialize Remotables with accessors like ${q(
                String(key),
              )} in ${candidate}`)) &&
          ((key === Symbol.toStringTag &&
            confirmIface(candidate[key], reject)) ||
            ((canBeMethod(candidate[key]) ||
              (reject &&
                reject`cannot serialize Remotables with non-methods like ${q(
                  String(key),
                )} in ${candidate}`)) &&
              (key !== PASS_STYLE ||
                (reject &&
                  reject`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`))))
        );
      });
    } else if (typeof candidate === 'function') {
      // Far functions cannot be methods, and cannot have methods.
      // They must have exactly expected `.name` and `.length` properties
      const {
        name: nameDesc,
        length: lengthDesc,
        // @ts-ignore TS doesn't like symbols as computed indexes??
        [Symbol.toStringTag]: toStringTagDesc,
        ...restDescs
      } = descs;
      const restKeys = ownKeys(restDescs);
      return (
        ((nameDesc && typeof nameDesc.value === 'string') ||
          (reject &&
            reject`Far function name must be a string, in ${candidate}`)) &&
        ((lengthDesc && typeof lengthDesc.value === 'number') ||
          (reject &&
            reject`Far function length must be a number, in ${candidate}`)) &&
        (toStringTagDesc === undefined ||
          ((typeof toStringTagDesc.value === 'string' ||
            (reject &&
              reject`Far function @@toStringTag must be a string, in ${candidate}`)) &&
            confirmIface(toStringTagDesc.value, reject))) &&
        (restKeys.length === 0 ||
          (reject &&
            reject`Far functions unexpected properties besides .name and .length ${restKeys}`))
      );
    }
    return reject && reject`unrecognized typeof ${candidate}`;
  },

  assertRestValid: candidate => confirmRemotable(candidate, Fail),

  every: (_passable, _fn) => true,
});$h͏_once.RemotableHelper(RemotableHelper);
})()
,
// === 12. pass-style ./src/make-far.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,getMethodNames,q,Fail,PASS_STYLE,assertIface,getInterfaceOf,RemotableHelper;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/eventual-send/utils.js", [["getMethodNames",[$h͏_a => (getMethodNames = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./passStyle-helpers.js", [["PASS_STYLE",[$h͏_a => (PASS_STYLE = $h͏_a)]]]],["./remotable.js", [["assertIface",[$h͏_a => (assertIface = $h͏_a)]],["getInterfaceOf",[$h͏_a => (getInterfaceOf = $h͏_a)]],["RemotableHelper",[$h͏_a => (RemotableHelper = $h͏_a)]]]]]);





/** @import {RemotableBrand} from '@endo/eventual-send' */
/** @import {InterfaceSpec, RemotableObject} from './types.js' */

const { prototype: functionPrototype } = Function;
const {
  getPrototypeOf,
  setPrototypeOf,
  create,
  isFrozen,
  prototype: objectPrototype,
} = Object;

/**
 * Now that the remotableProto does not provide its own `toString` method,
 * ensure it always inherits from something. The original prototype of
 * `remotable` if there was one, or `Object.prototype` otherwise.
 *
 * @param {object} remotable
 * @param {InterfaceSpec} iface
 * @returns {object}
 */
const makeRemotableProto = (remotable, iface) => {
  let oldProto = getPrototypeOf(remotable);
  if (typeof remotable === 'object') {
    if (oldProto === null) {
      oldProto = objectPrototype;
    }
    oldProto === objectPrototype ||
      Fail`For now, remotables cannot inherit from anything unusual, in ${remotable}`;
  } else if (typeof remotable === 'function') {
    oldProto !== null ||
      Fail`Original function must not inherit from null: ${remotable}`;
    oldProto === functionPrototype ||
      getPrototypeOf(oldProto) === functionPrototype ||
      Fail`Far functions must originally inherit from Function.prototype, in ${remotable}`;
  } else {
    Fail`unrecognized typeof ${remotable}`;
  }
  return harden(
    create(oldProto, {
      [PASS_STYLE]: { value: 'remotable' },
      [Symbol.toStringTag]: { value: iface },
    }),
  );
};

const assertCanBeRemotable = candidate =>
  RemotableHelper.confirmCanBeValid(candidate, Fail);

/**
 * Create and register a Remotable.  After this, getInterfaceOf(remotable)
 * returns iface.
 *
 * // https://github.com/Agoric/agoric-sdk/issues/804
 *
 * @template {{}} T
 * @template {InterfaceSpec} I
 * @param {I} [iface] The interface specification for
 * the remotable. For now, a string iface must be "Remotable" or begin with
 * "Alleged: " or "DebugName: ", to serve as the alleged name. More
 * general ifaces are not yet implemented. This is temporary. We include the
 * "Alleged" or "DebugName" as a reminder that we do not yet have SwingSet
 * or Comms Vat
 * support for ensuring this is according to the vat hosting the object.
 * Currently, Alice can tell Bob about Carol, where VatA (on Alice's behalf)
 * misrepresents Carol's `iface`. VatB and therefore Bob will then see
 * Carol's `iface` as misrepresented by VatA.
 * @param {undefined} [props] Currently may only be undefined.
 * That plan is that own-properties are copied to the remotable
 * @param {T} [remotable] The object used as the remotable
 * @returns {T & RemotableObject<I> & RemotableBrand<{}, T>}} remotable, modified for debuggability
 */
       const Remotable = (
  // @ts-expect-error I could have different subtype than string
  iface = 'Remotable',
  props = undefined,
  remotable = /** @type {T} */ ({}),
) => {
  assertIface(iface);
  assert(iface);
  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
  props === undefined || Fail`Remotable props not yet implemented ${props}`;

  // Fail fast: check that the unmodified object is able to become a Remotable.
  assertCanBeRemotable(remotable);

  // Ensure that the remotable isn't already marked.
  !(PASS_STYLE in remotable) ||
    Fail`Remotable ${remotable} is already marked as a ${q(
      remotable[PASS_STYLE],
    )}`;
  // Ensure that the remotable isn't already frozen.
  // Recall that isFrozen always returns true when using lockdown with
  // hardenTaming set to the deprecated `'unsafe'` option.
  isFrozen(remotable) === isFrozen({}) ||
    Fail`Remotable ${remotable} is already frozen`;
  const remotableProto = makeRemotableProto(remotable, iface);

  // Take a static copy of the enumerable own properties as data properties.
  // const propDescs = getOwnPropertyDescriptors({ ...props });
  const mutateHardenAndCheck = target => {
    // defineProperties(target, propDescs);
    setPrototypeOf(target, remotableProto);
    harden(target);
    assertCanBeRemotable(target);
  };

  // Fail fast: check a fresh remotable to see if our rules fit.
  mutateHardenAndCheck({});

  // Actually finish the new remotable.
  mutateHardenAndCheck(remotable);

  // COMMITTED!
  // We're committed, so keep the interface for future reference.
  assert(iface !== undefined); // To make TypeScript happy
  return /** @type {any} */ (remotable);
};$h͏_once.Remotable(Remotable);
harden(Remotable);

/**
 * The name of the automatically added default meta-method for obtaining a
 * list of all methods of an object declared with `Far`, or an object that
 * inherits from an object declared with `Far`.
 *
 * Modeled on `GET_INTERFACE_GUARD` from `@endo/exo`.
 *
 * TODO Name to be bikeshed. Perhaps even whether it is a
 * string or symbol to be bikeshed. See
 * https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * HAZARD: Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
       const GET_METHOD_NAMES = '__getMethodNames__';

/**
 * Note that `getMethodNamesMethod` is a thisful method! It must be so that
 * it works as expected with far-object inheritance.
 *
 * @returns {(string|symbol)[]}
 */$h͏_once.GET_METHOD_NAMES(GET_METHOD_NAMES);
const getMethodNamesMethod = harden({
  [GET_METHOD_NAMES]() {
    return getMethodNames(this);
  },
})[GET_METHOD_NAMES];

const getMethodNamesDescriptor = harden({
  value: getMethodNamesMethod,
  enumerable: false,
  configurable: false,
  writable: false,
});

/**
 * Mark an object to be exposed for remote interaction
 * and give it a suggestive interface name for debugging.
 *
 * All properties of the object have to be methods, not data.
 *
 * The object must not be hardened before it is marked.
 * It will be hardened after marking.
 *
 * For far objects (as opposed to far functions), also adds
 * `__getMethodNames__` method that returns an array of all the method names,
 * if there is not yet any method named `__getMethodNames__`.
 *
 * @example
 * Far('Employee', { getManager })
 * @template {{}} T
 * @param {string} farName This name will be prepended with `Alleged: `
 * for now to form the `Remotable` `iface` argument.
 * @param {T} [remotable] The object to be marked as remotable
 */
       const Far = (farName, remotable = undefined) => {
  const r = remotable === undefined ? /** @type {T} */ ({}) : remotable;
  if (typeof r === 'object' && !(GET_METHOD_NAMES in r)) {
    // This test excludes far functions, since we currently consider them
    // to only have a call-behavior, with no callable methods.
    // Beware: Mutates the input argument! But `Remotable`
    // * requires the object to be mutable
    // * does further mutations,
    // * hardens the mutated object before returning it.
    // so this mutation is not unprecedented. But it is surprising!
    Object.defineProperty(r, GET_METHOD_NAMES, getMethodNamesDescriptor);
  }
  return Remotable(`Alleged: ${farName}`, undefined, r);
};$h͏_once.Far(Far);
harden(Far);

/**
 * Coerce `func` to a far function that preserves its call behavior.
 * If it is already a far function, return it. Otherwise make and return a
 * new far function that wraps `func` and forwards calls to it. This
 * works even if `func` is already frozen. `ToFarFunction` is to be used
 * when the function comes from elsewhere under less control. For functions
 * you author in place, better to use `Far` on their function literal directly.
 *
 * @template {(...args: any[]) => any} F
 * @param {string} farName to be used only if `func` is not already a
 * far function.
 * @param {F} func
 * @returns {F & RemotableObject & RemotableBrand<{}, F>}
 */
       const ToFarFunction = (farName, func) => {
  if (getInterfaceOf(func) !== undefined) {
    // @ts-expect-error checked cast
    return func;
  }
  // @ts-expect-error could be different subtype
  return Far(farName, (...args) => func(...args));
};$h͏_once.ToFarFunction(ToFarFunction);
harden(ToFarFunction);
})()
,
// === 13. pass-style ./src/iter-helpers.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Far;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./make-far.js", [["Far",[$h͏_a => (Far = $h͏_a)]]]]]);


/**
 * The result iterator has as many elements as the `baseIterator` and
 * have the same termination -- the same completion value or failure
 * reason. But the non-final values are the corresponding non-final
 * values from `baseIterator` as transformed by `func`.
 *
 * @template T,U
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => U} func
 * @returns {Iterable<U>}
 */
       const mapIterable = (baseIterable, func) =>
  /** @type {Iterable<U>} */
  Far('mapped iterable', {
    [Symbol.iterator]: () => {
      const baseIterator = baseIterable[Symbol.iterator]();
      return Far('mapped iterator', {
        next: () => {
          const { value: baseValue, done } = baseIterator.next();
          const value = done ? baseValue : func(baseValue);
          return harden({ value, done });
        },
      });
    },
  });$h͏_once.mapIterable(mapIterable);
harden(mapIterable);

/**
 * The result iterator has a subset of the non-final values from the
 * `baseIterator` --- those for which `pred(value)` was truthy. The result
 * has the same termination as the `baseIterator` -- the same completion value
 * or failure reason.
 *
 * @template T
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => boolean} pred
 * @returns {Iterable<T>}
 */
       const filterIterable = (baseIterable, pred) =>
  /** @type {Iterable<U>} */
  Far('filtered iterable', {
    [Symbol.iterator]: () => {
      const baseIterator = baseIterable[Symbol.iterator]();
      return Far('filtered iterator', {
        next: () => {
          for (;;) {
            const result = baseIterator.next();
            const { value, done } = result;
            if (done || pred(value)) {
              return result;
            }
          }
        },
      });
    },
  });$h͏_once.filterIterable(filterIterable);
harden(filterIterable);
})()
,
// === 14. harden ./is-noop.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);const { getOwnPropertyDescriptor } = Object;

const memo = new WeakMap();

/**
 * Empirically determines whether the `harden` exported by `@endo/harden`
 * is a noop harden.
 * @param {<T>(object: T) => T} harden
 */
const hardenIsNoop = harden => {
  let isNoop = memo.get(harden);
  if (isNoop !== undefined) return isNoop;
  // We do not trust isFrozen because lockdown with unsafe hardenTaming replaces
  // isFrozen with a version that is in cahoots with fake harden.
  const subject = harden({ __proto__: null, x: 0 });
  const desc = getOwnPropertyDescriptor(subject, 'x');
  isNoop = desc?.writable === true;
  memo.set(harden, isNoop);
  return isNoop;
};

const{default:$c͏_default}={default:hardenIsNoop};$h͏_once.default($c͏_default);
})()
,
// === 15. pass-style ./src/error.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,hardenIsNoop,Fail,q,hideAndHardenFunction;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/harden/is-noop.js", [["default",[$h͏_a => (hardenIsNoop = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);



/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 * @import {PassStyle} from './types.js';
 */

const {
  defineProperty,
  getPrototypeOf,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
  hasOwn,
  entries,
  freeze,
} = Object;

const { apply } = Reflect;

/**
 * Pass-style must defend its own integrity under a number of configurations.
 *
 * In all environments where we use pass-style, we can in principle rely on the
 * globalThis.TypeError and globalThis.Error to be safe.
 * We have similar code in SES that stands on the irreducible risk that an
 * attacker may run before SES, so the application must either ensure that SES
 * initializes first or that all prior code is benign.
 * For all other configurations, we rely to some degree on SES lockdown and a
 * Compartment for any measure of safety.
 *
 * Pass-style may be loaded by the host module system into the primary realm,
 * which the authors call the Start Compartment.
 * SES provides no assurances that any number of guest programs can be safely
 * executed by the host in the start compartment.
 * Such code must be executed in a guest compartment.
 * As such, it is irrelevant that the globalThis is mutable and also holds all
 * of the host's authority.
 *
 * Pass-style may be loaded into a guest compartment, and the globalThis of the
 * compartment may or may not be frozen.
 * We typically, as with importBundle, run every Node.js package in a dedicated
 * compartment with a gratuitiously frozen globalThis.
 * In this configuration, we can rely on globalThis.Error and
 * globalThis.TypeError to correspond to the realm's intrinsics, either because
 * the Compartment arranged for a frozen globalThis or because the pass-style
 * package provides no code that can arrange for a change to the compartment's
 * globalThis.
 *
 * Running multiple guests in a single compartment with an unfrozen globalThis
 * is incoherent and provides no assurance of mutual safety between those
 * guests.
 * No code, much less Pass-style, should be run in such a compartment.
 *
 * Although we can rely on the globalThis.Error and globalThis.TypeError
 * bindings, we can and do use `makeTypeError` to produce a TypeError instance
 * that is guaranteed to be an instance of the realm intrinsic by dint of
 * construction from language syntax.
 * The idiom "belt and suspenders" is well-known among the authors and means
 * gratuitous or redundant safety measures.
 * In this case, we wear both belt and suspenders *on our overalls*.
 *
 * @returns {TypeError}
 */
const makeTypeError = () => {
  try {
    // @ts-expect-error deliberate TypeError
    null.null;
    throw TypeError('obligatory'); // To convince the type flow inferrence.
  } catch (error) {
    return error;
  }
};

       const makeRepairError = () => {
  if (!hardenIsNoop(harden)) {
    return undefined;
  }

  const typeErrorStackDesc = getOwnPropertyDescriptor(makeTypeError(), 'stack');
  const errorStackDesc = getOwnPropertyDescriptor(Error('obligatory'), 'stack');

  if (
    typeErrorStackDesc === undefined ||
    typeErrorStackDesc.get === undefined
  ) {
    return undefined;
  }

  if (
    errorStackDesc === undefined ||
    typeof typeErrorStackDesc.get !== 'function' ||
    typeErrorStackDesc.get !== errorStackDesc.get ||
    typeof typeErrorStackDesc.set !== 'function' ||
    typeErrorStackDesc.set !== errorStackDesc.set
  ) {
    // We have own stack accessor properties that are outside our expectations,
    // that therefore need to be understood better before we know how to repair
    // them.
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR.md
    throw TypeError(
      'Unexpected Error own stack accessor functions (PASS_STYLE_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)',
    );
  }

  // We should otherwise only encounter this case on V8 and possibly immitators
  // like FaceBook's Hermes because of its problematic error own stack accessor
  // behavior, which creates an undeniable channel for communicating arbitrary
  // capabilities through the stack internal slot of arbitrary frozen objects.
  // Note that FF/SpiderMonkey, Moddable/XS, and the error stack proposal
  // all inherit a stack accessor property from Error.prototype, which is
  // great. That case needs no heroics to secure.

  // In the V8 case as we understand it, all errors have an own stack accessor
  // property, but within the same realm, all these accessor properties have
  // the same getter and have the same setter.
  // This is therefore the case that we repair.
  //
  // Also, we expect tht the captureStackTrace proposal to create more cases
  // where error objects have own "stack" getters.
  // https://github.com/tc39/proposal-error-capturestacktrace

  const feralStackGetter = freeze(errorStackDesc.get);

  /** @param {unknown} error */
  const repairError = error => {
    // Only pay the overhead if it first passes this cheap isError
    // check. Otherwise, it will be unrepaired, but won't be judged
    // to be a passable error anyway, so will not be unsafe.
    const stackDesc = getOwnPropertyDescriptor(error, 'stack');
    if (
      stackDesc &&
      stackDesc.get === feralStackGetter &&
      stackDesc.configurable
    ) {
      // Can only repair if it is configurable. Otherwise, leave
      // unrepaired, in which case it will not be judged passable,
      // avoiding a safety problem.
      defineProperty(error, 'stack', {
        // NOTE: Calls getter during harden, which seems dangerous.
        // But we're only calling the problematic getter whose
        // hazards we think we understand.
        value: apply(feralStackGetter, error, []),
      });
    }
  };
  harden(repairError);

  return repairError;
};$h͏_once.makeRepairError(makeRepairError);
harden(makeRepairError);

       const repairError = makeRepairError();

// TODO: Maintenance hazard: Coordinate with the list of errors in the SES
// whilelist.
$h͏_once.repairError(repairError);const errorConstructors=new Map(
  // Cast because otherwise TS is confused by AggregateError
  // See https://github.com/endojs/endo/pull/2042#discussion_r1484933028
  /** @type {Array<[string, import('ses').GenericErrorConstructor]>} */
  ([
    ['Error', Error],
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError]

    // https://github.com/endojs/endo/issues/550
    // To accommodate platforms prior to AggregateError, we comment out the
    // following line and instead conditionally add it to the map below.
    // ['AggregateError', AggregateError],
  ]),
);

if (typeof AggregateError !== 'undefined') {
  // Conditional, to accommodate platforms prior to AggregateError
  errorConstructors.set('AggregateError', AggregateError);
}

/**
 * Because the error constructor returned by this function might be
 * `AggregateError`, which has different construction parameters
 * from the other error constructors, do not use it directly to try
 * to make an error instance. Rather, use `makeError` which encapsulates
 * this non-uniformity.
 *
 * @param {string} name
 * @returns {import('ses').GenericErrorConstructor | undefined}
 */
       const getErrorConstructor = name => errorConstructors.get(name);$h͏_once.getErrorConstructor(getErrorConstructor);
harden(getErrorConstructor);

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmErrorLike = (candidate, reject) => {
  // TODO: Need a better test than instanceof
  return (
    candidate instanceof Error ||
    (reject && reject`Error expected: ${candidate}`)
  );
};
harden(confirmErrorLike);
/// <reference types="ses"/>

/**
 * Validating error objects are passable raises a tension between security
 * vs preserving diagnostic information. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error-like test succeed and to couch these
 * complaints as notes on the error.
 *
 * To resolve this, such a malformed error object will still pass
 * `isErrorLike` so marshal can use this for top level error to report from,
 * even if it would not actually validate.
 * Instead, the diagnostics that `assertError` would have reported are
 * attached as notes to the malformed error. Thus, a malformed
 * error is passable by itself, but not as part of a passable structure.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
       const isErrorLike = candidate => confirmErrorLike(candidate, false);$h͏_once.isErrorLike(isErrorLike);
hideAndHardenFunction(isErrorLike);

/**
 * @param {string} propName
 * @param {PropertyDescriptor} desc
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmRecursivelyPassableErrorPropertyDesc = (
  propName,
  desc,
  passStyleOfRecur,
  reject,
) => {
  if (desc.enumerable) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must not be enumerable: ${desc}`
    );
  }
  if (!hasOwn(desc, 'value')) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must be a data property: ${desc}`
    );
  }
  const { value } = desc;
  switch (propName) {
    case 'message':
    case 'stack': {
      return (
        typeof value === 'string' ||
        (reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a string: ${value}`)
      );
    }
    case 'cause': {
      // eslint-disable-next-line no-use-before-define
      return confirmRecursivelyPassableError(value, passStyleOfRecur, reject);
    }
    case 'errors': {
      if (!Array.isArray(value) || passStyleOfRecur(value) !== 'copyArray') {
        return (
          reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a copyArray: ${value}`
        );
      }
      return value.every(err =>
        // eslint-disable-next-line no-use-before-define
        confirmRecursivelyPassableError(err, passStyleOfRecur, reject),
      );
    }
    default: {
      break;
    }
  }
  return (
    reject && reject`Passable Error has extra unpassed property ${q(propName)}`
  );
};$h͏_once.confirmRecursivelyPassableErrorPropertyDesc(confirmRecursivelyPassableErrorPropertyDesc);
harden(confirmRecursivelyPassableErrorPropertyDesc);

/**
 * @param {unknown} candidate
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmRecursivelyPassableError = (
  candidate,
  passStyleOfRecur,
  reject,
) => {
  if (!confirmErrorLike(candidate, reject)) {
    return false;
  }
  const proto = getPrototypeOf(candidate);
  const { name } = proto;
  const errConstructor = getErrorConstructor(name);
  if (errConstructor === undefined || errConstructor.prototype !== proto) {
    return (
      reject &&
      reject`Passable Error must inherit from an error class .prototype: ${candidate}`
    );
  }
  if (repairError !== undefined) {
    // This point is unreachable unless the candidate is mutable and the
    // platform is V8 or like V8 creates errors with an own "stack" getter or
    // setter, which would otherwise make them non-passable.
    // This should only occur with lockdown using unsafe hardenTaming or an
    // equivalent fake, non-actually-freezing harden.
    // Under these circumstances only, passStyleOf alters an object as a side
    // effect, converting the "stack" property to a data value.
    repairError(candidate);
  }
  const descs = getOwnPropertyDescriptors(candidate);
  if (!('message' in descs)) {
    return (
      reject &&
      reject`Passable Error must have an own "message" string property: ${candidate}`
    );
  }

  return entries(descs).every(([propName, desc]) =>
    confirmRecursivelyPassableErrorPropertyDesc(
      propName,
      desc,
      passStyleOfRecur,
      reject,
    ),
  );
};$h͏_once.confirmRecursivelyPassableError(confirmRecursivelyPassableError);
harden(confirmRecursivelyPassableError);

/** @type {PassStyleHelper} */
       const ErrorHelper = harden({
  styleName: 'error',

  confirmCanBeValid: confirmErrorLike,

  assertRestValid: (candidate, passStyleOfRecur) =>
    confirmRecursivelyPassableError(candidate, passStyleOfRecur, Fail),
});$h͏_once.ErrorHelper(ErrorHelper);
})()
,
// === 16. pass-style ./src/symbol.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,q,hideAndHardenFunction;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);


const { ownKeys } = Reflect;

/**
 * The well known symbols are static symbol values on the `Symbol` constructor.
 */
const wellKnownSymbolNames = new Map(
  ownKeys(Symbol)
    .filter(
      name => typeof name === 'string' && typeof Symbol[name] === 'symbol',
    )
    .filter(name => {
      // @ts-expect-error It doesn't know name cannot be a symbol
      !name.startsWith('@@') ||
        Fail`Did not expect Symbol to have a symbol-valued property name starting with "@@" ${q(
          name,
        )}`;
      return true;
    })
    // @ts-ignore It doesn't know name cannot be a symbol
    .map(name => [Symbol[name], `@@${name}`]),
);

/**
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols.
 *
 * @param {any} sym
 * @returns {boolean}
 */
       const isPassableSymbol = sym =>
  typeof sym === 'symbol' &&
  (typeof Symbol.keyFor(sym) === 'string' || wellKnownSymbolNames.has(sym));$h͏_once.isPassableSymbol(isPassableSymbol);
harden(isPassableSymbol);

       const assertPassableSymbol = sym =>
  isPassableSymbol(sym) ||
  Fail`Only registered symbols or well-known symbols are passable: ${q(sym)}`;$h͏_once.assertPassableSymbol(assertPassableSymbol);
hideAndHardenFunction(assertPassableSymbol);

/**
 * If `sym` is a passable symbol, return a string that uniquely identifies this
 * symbol. If `sym` is a non-passable symbol, return `undefined`.
 *
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols. Since the registration string of a registered symbol can be any
 * string, if we simply used that to identify those symbols, there would not
 * be any remaining strings left over to identify the well-known symbols.
 * Instead, we reserve strings beginning with `"@@"` for purposes of this
 * encoding. We identify a well known symbol such as `Symbol.iterator`
 * by prefixing the property name with `"@@"`, such as `"@@iterator"`.
 * For registered symbols whose name happens to begin with `"@@"`, such
 * as `Symbol.for('@@iterator')` or `Symbol.for('@@foo')`, we identify
 * them by prefixing them with an extra `"@@"`, such as
 * `"@@@@iterator"` or `"@@@@foo"`. (This is the Hilbert Hotel encoding
 * technique.)
 *
 * @param {symbol} sym
 * @returns {string=}
 */
       const nameForPassableSymbol = sym => {
  const name = Symbol.keyFor(sym);
  if (name === undefined) {
    return wellKnownSymbolNames.get(sym);
  }
  if (name.startsWith('@@')) {
    return `@@${name}`;
  }
  return name;
};$h͏_once.nameForPassableSymbol(nameForPassableSymbol);
harden(nameForPassableSymbol);

const AtAtPrefixPattern = /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * If `name` is a string that could have been produced by
 * `nameForPassableSymbol`, return the symbol argument it was produced to
 * represent.
 *
 *    If `name` does not begin with `"@@"`, then just the corresponding
 *      registered symbol, `Symbol.for(name)`.
 *    If `name` is `"@@"` followed by a well known symbol's property name on
 *      `Symbol` such `"@@iterator", return that well known symbol such as
 *      `Symbol.iterator`
 *    If `name` begins with `"@@@@"` it encodes the registered symbol whose
 *      name begins with `"@@"` instead.
 *    Otherwise, if name begins with `"@@"` it may encode a registered symbol
 *      from a future version of JavaScript, but it is not one we can decode
 *      yet, so throw.
 *
 * @param {string} name
 * @returns {symbol}
 */
       const passableSymbolForName = name => {
  typeof name === 'string' ||
    Fail`${q(name)} must be a string, not ${q(typeof name)}`;
  const match = AtAtPrefixPattern.exec(name);
  if (match) {
    const suffix = match[1];
    if (suffix.startsWith('@@')) {
      return Symbol.for(suffix);
    } else {
      const sym = Symbol[suffix];
      if (typeof sym === 'symbol') {
        return sym;
      }
      Fail`Reserved for well known symbol ${q(suffix)}: ${q(name)}`;
    }
  }
  return Symbol.for(name);
};$h͏_once.passableSymbolForName(passableSymbolForName);
harden(passableSymbolForName);

/**
 * @param {string} name
 * @returns {symbol}
 */
       const unpassableSymbolForName = name => Symbol(name);$h͏_once.unpassableSymbolForName(unpassableSymbolForName);
})()
,
// === 17. pass-style ./src/string.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let getEnvironmentOption,Fail,hideAndHardenFunction;$h͏_imports([["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getEnvironmentOption = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);


// know about`isWellFormed`
const hasWellFormedStringMethod = !!String.prototype.isWellFormed;

/**
 * Is the argument a well-formed string?
 *
 * Unfortunately, the
 * [standard built-in `String.prototype.isWellFormed`](https://github.com/tc39/proposal-is-usv-string)
 * does a ToString on its input, causing it to judge non-strings to be
 * well-formed strings if they coerce to a well-formed strings. This
 * recapitulates the mistake in having the global `isNaN` coerce its inputs,
 * causing it to judge non-string to be NaN if they coerce to NaN.
 *
 * This `isWellFormedString` function only judges well-formed strings to be
 * well-formed strings. For all non-strings it returns false.
 *
 * @param {unknown} str
 * @returns {str is string}
 */
       const isWellFormedString = hasWellFormedStringMethod
  ? str => typeof str === 'string' && str.isWellFormed()
  : str => {
      if (typeof str !== 'string') {
        return false;
      }
      for (const ch of str) {
        // The string iterator iterates by Unicode code point, not
        // UTF16 code unit. But if it encounters an unpaired surrogate,
        // it will produce it.
        const cp = /** @type {number} */ (ch.codePointAt(0));
        if (cp >= 0xd800 && cp <= 0xdfff) {
          // All surrogates are in this range. The string iterator only
          // produces a character in this range for unpaired surrogates,
          // which only happens if the string is not well-formed.
          return false;
        }
      }
      return true;
    };$h͏_once.isWellFormedString(isWellFormedString);
hideAndHardenFunction(isWellFormedString);

/**
 * Returns normally when `isWellFormedString(str)` would return true.
 * Throws a diagnostic error when `isWellFormedString(str)` would return false.
 *
 * @param {unknown} str
 * @returns {asserts str is string}
 */
       const assertWellFormedString = str => {
  isWellFormedString(str) || Fail`Expected well-formed unicode string: ${str}`;
};$h͏_once.assertWellFormedString(assertWellFormedString);
hideAndHardenFunction(assertWellFormedString);

const ONLY_WELL_FORMED_STRINGS_PASSABLE =
  getEnvironmentOption('ONLY_WELL_FORMED_STRINGS_PASSABLE', 'disabled', [
    'enabled',
  ]) === 'enabled';

/**
 * For now,
 * if `ONLY_WELL_FORMED_STRINGS_PASSABLE` environment option is `'enabled'`,
 * then `assertPassableString` is the same as `assertWellFormedString`.
 * Otherwise `assertPassableString` just asserts that `str` is a string.
 *
 * Currently, `ONLY_WELL_FORMED_STRINGS_PASSABLE` defaults to `'disabled'`
 * because we do not yet know the performance impact. Later, if we decide we
 * can afford it, we'll first change the default to `'enabled'` and ultimately
 * remove the switch altogether. Be prepared for these changes.
 *
 * TODO once the switch is removed, simplify `assertPassableString` to
 * simply be `assertWellFormedString`.
 *
 * @param { unknown } str
 * @returns {asserts str is string }
 */
       const assertPassableString = str => {
  typeof str === 'string' || Fail`Expected string ${str}`;
  !ONLY_WELL_FORMED_STRINGS_PASSABLE || assertWellFormedString(str);
};$h͏_once.assertPassableString(assertPassableString);
hideAndHardenFunction(assertPassableString);
})()
,
// === 18. promise-kit ./src/promise-executor-kit.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);


/**
 * @template T
 * @callback PromiseExecutor The promise executor
 * @param {(value: import('./types.js').ERef<T>) => void} resolve
 * @param {(reason: any) => void} reject
 */

/**
 * makeReleasingExecutorKit() builds resolve/reject functions which drop references
 * to the resolve/reject functions gathered from an executor to be used with a
 * promise constructor.
 *
 * @template T
 * @returns {Pick<import('./types.js').PromiseKit<T>, 'resolve' | 'reject'> & { executor: PromiseExecutor<T>}}
 */
       const makeReleasingExecutorKit = () => {
  /** @type {null | undefined | ((value: import('./types.js').ERef<T>) => void)} */
  let internalResolve;
  /** @type {null | undefined | ((reason: unknown) => void)} */
  let internalReject;

  /** @param {import('./types.js').ERef<T>} value */
  const resolve = value => {
    if (internalResolve) {
      internalResolve(value);
      internalResolve = null;
      internalReject = null;
    } else {
      assert(internalResolve === null);
    }
  };

  /** @param {unknown} reason */
  const reject = reason => {
    if (internalReject) {
      internalReject(reason);
      internalResolve = null;
      internalReject = null;
    } else {
      assert(internalReject === null);
    }
  };

  const executor = (res, rej) => {
    assert(internalResolve === undefined && internalReject === undefined);
    internalResolve = res;
    internalReject = rej;
  };

  return harden({ resolve, reject, executor });
};$h͏_once.makeReleasingExecutorKit(makeReleasingExecutorKit);
harden(makeReleasingExecutorKit);
})()
,
// === 19. promise-kit ./src/memo-race.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);































/**
 * TODO Consolidate with `isPrimitive` that's currently in `@endo/pass-style`.
 * Layering constraints make this tricky, which is why we haven't yet figured
 * out how to do this.
 *
 * @type {(val: unknown) => val is (undefined
 * | null
 * | boolean
 * | number
 * | bigint
 * | string
 * | symbol)}
 */
const isPrimitive = val =>
  !val || (typeof val !== 'object' && typeof val !== 'function');

/**
 * @template [T=any]
 * @typedef {object} Deferred
 * @property {(value?: import("./types.js").ERef<T> ) => void} resolve
 * @property {(err?: any ) => void} reject
 */

/**
 * @typedef { never
 *  | {settled: false, deferreds: Set<Deferred>}
 *  | {settled: true, deferreds?: undefined}
 * } PromiseMemoRecord
 */

// Keys are the values passed to race, values are a record of data containing a
// set of deferreds and whether the value has settled.
/** @type {WeakMap<object, PromiseMemoRecord>} */
const knownPromises = new WeakMap();

/**
 * @param {PromiseMemoRecord | undefined} record
 * @returns {Set<Deferred>}
 */
const markSettled = record => {
  if (!record || record.settled) {
    return new Set();
  }

  const { deferreds } = record;
  Object.assign(record, {
    deferreds: undefined,
    settled: true,
  });
  Object.freeze(record);
  return deferreds;
};

/**
 *
 * @param {any} value
 * @returns {PromiseMemoRecord}
 */
const getMemoRecord = value => {
  if (isPrimitive(value)) {
    // If the contender is a primitive, attempting to use it as a key in the
    // weakmap would throw an error. Luckily, it is safe to call
    // `Promise.resolve(contender).then` on a primitive value multiple times
    // because the promise fulfills immediately. So we fake a settled record.
    return harden({ settled: true });
  }

  let record = knownPromises.get(value);

  if (!record) {
    record = { deferreds: new Set(), settled: false };
    knownPromises.set(value, record);
    // This call to `then` happens once for the lifetime of the value.
    Promise.resolve(value).then(
      val => {
        for (const { resolve } of markSettled(record)) {
          resolve(val);
        }
      },
      err => {
        for (const { reject } of markSettled(record)) {
          reject(err);
        }
      },
    );
  }
  return record;
};

const { race } = {
  /**
   * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
   * or rejected.
   *
   * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
   * the result promise.
   *
   * @template {readonly unknown[] | []} T
   * @template {PromiseConstructor} [P=PromiseConstructor]
   * @this {P}
   * @param {T} values An iterable of Promises.
   * @returns {Promise<Awaited<T[number]>>} A new Promise.
   */
  race(values) {
    let deferred;
    /** @type {[...T]} */
    // @ts-expect-error filled by the loop
    const cachedValues = [];
    const C = this;
    const result = new C((resolve, reject) => {
      deferred = { resolve, reject };
      for (const value of values) {
        cachedValues.push(value);
        const { settled, deferreds } = getMemoRecord(value);
        if (settled) {
          // If the contender is settled (including primitives), it is safe
          // to call `Promise.resolve(value).then` on it.
          C.resolve(value).then(resolve, reject);
        } else {
          deferreds.add(deferred);
        }
      }
    });

    // The finally callback executes when any value settles, preventing any of
    // the unresolved values from retaining a reference to the resolved value.
    return result.finally(() => {
      for (const value of cachedValues) {
        const { deferreds } = getMemoRecord(value);
        if (deferreds) {
          deferreds.delete(deferred);
        }
      }
    });
  },
};$h͏_once.race(race);
})()
,
// === 20. promise-kit ./src/is-promise.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);Object.defineProperty(isPromise,'name',{value:"isPromise"});$h͏_once.isPromise(isPromise);

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
       function isPromise(maybePromise) {
  return Promise.resolve(maybePromise) === maybePromise;
}
harden(isPromise);
})()
,
// === 21. promise-kit ./src/types.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 22. promise-kit ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,makeReleasingExecutorKit,memoRace;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./src/promise-executor-kit.js", [["makeReleasingExecutorKit",[$h͏_a => (makeReleasingExecutorKit = $h͏_a)]]]],["./src/memo-race.js", [["memoRace",[$h͏_a => (memoRace = $h͏_a)]]]],["./src/is-promise.js", []],["./src/types.js", []]]);Object.defineProperty(makePromiseKit,'name',{value:"makePromiseKit"});$h͏_once.makePromiseKit(makePromiseKit);Object.defineProperty(racePromises,'name',{value:"racePromises"});$h͏_once.racePromises(racePromises);









/** @type {PromiseConstructor} */
const BestPipelinablePromise = globalThis.HandledPromise || Promise;

/**
 * makePromiseKit() builds a Promise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {import('./src/types.js').PromiseKit<T>}
 */
       function makePromiseKit() {
  const { resolve, reject, executor } = makeReleasingExecutorKit();

  const promise = new BestPipelinablePromise(executor);

  return harden({ promise, resolve, reject });
}
harden(makePromiseKit);

// NB: Another implementation for Promise.race would be to use the releasing executor,
// However while it would no longer leak the raced promise objects themselves, it would
// still leak reactions on the non-resolved promises contending for the race.

/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template {readonly unknown[] | []} T
 * @param {T} values An iterable of Promises.
 * @returns {Promise<Awaited<T[number]>>} A new Promise.
 */
       function racePromises(values) {
  return harden(memoRace.call(BestPipelinablePromise, values));
}
harden(racePromises);
})()
,
// === 23. pass-style ./src/copyArray.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,X,confirmOwnDataDescriptor;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["X",[$h͏_a => (X = $h͏_a)]]]],["./passStyle-helpers.js", [["confirmOwnDataDescriptor",[$h͏_a => (confirmOwnDataDescriptor = $h͏_a)]]]]]);



const { getPrototypeOf } = Object;
const { ownKeys } = Reflect;
const { isArray, prototype: arrayPrototype } = Array;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
       const CopyArrayHelper = harden({
  styleName: 'copyArray',

  confirmCanBeValid: (candidate, reject) =>
    isArray(candidate) || (reject && reject`Array expected: ${candidate}`),

  assertRestValid: (candidate, passStyleOfRecur) => {
    getPrototypeOf(candidate) === arrayPrototype ||
      assert.fail(X`Malformed array: ${candidate}`, TypeError);
    // Since we're already ensured candidate is an array, it should not be
    // possible for the following get to fail.
    const len = /** @type {number} */ (
      confirmOwnDataDescriptor(candidate, 'length', false, Fail).value
    );
    // Validate that each index property is own/data/enumerable
    // and its associated value is recursively passable.
    for (let i = 0; i < len; i += 1) {
      passStyleOfRecur(
        confirmOwnDataDescriptor(candidate, i, true, Fail).value,
      );
    }
    // Expect one key per index plus one for 'length'.
    ownKeys(candidate).length === len + 1 ||
      assert.fail(X`Arrays must not have non-indexes: ${candidate}`, TypeError);
  },
});$h͏_once.CopyArrayHelper(CopyArrayHelper);
})()
,
// === 24. pass-style ./src/byteArray.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,X,Fail;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]]]);


/**
 * @import {PassStyleHelper} from './internal-types.js';
 */

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;
const { ownKeys, apply } = Reflect;

// Detects the presence of a immutable ArrayBuffer support in the underlying
// platform and provides either suitable values from that implementation or
// values that will consistently deny that immutable ArrayBuffers exist.
const adaptImmutableArrayBuffer = () => {
  const anArrayBuffer = new ArrayBuffer(0);

  // On platforms that do not support sliceToImmutable, pass-style byteArray
  // cannot be constructed.
  if (anArrayBuffer.sliceToImmutable === undefined) {
    return {
      immutableArrayBufferPrototype: null,
      immutableGetter: () => false,
    };
  }

  const anImmutableArrayBuffer = anArrayBuffer.sliceToImmutable();

  /**
   * As proposed, this will be the same as `ArrayBuffer.prototype`. As shimmed,
   * this will be a hidden intrinsic that inherits from `ArrayBuffer.prototype`.
   * Either way, get this in a way that we can trust it after lockdown, and
   * require that all immutable ArrayBuffers directly inherit from it.
   */
  const immutableArrayBufferPrototype = getPrototypeOf(anImmutableArrayBuffer);

  const immutableGetter = /** @type {(this: ArrayBuffer) => boolean} */ (
    // @ts-expect-error We know the desciptor is there.
    getOwnPropertyDescriptor(immutableArrayBufferPrototype, 'immutable').get
  );

  return { immutableArrayBufferPrototype, immutableGetter };
};

const { immutableArrayBufferPrototype, immutableGetter } =
  adaptImmutableArrayBuffer();

/**
 * @type {PassStyleHelper}
 */
       const ByteArrayHelper = harden({
  styleName: 'byteArray',

  confirmCanBeValid: (candidate, reject) =>
    (candidate instanceof ArrayBuffer && candidate.immutable) ||
    (reject && reject`Immutable ArrayBuffer expected: ${candidate}`),

  assertRestValid: (candidate, _passStyleOfRecur) => {
    getPrototypeOf(candidate) === immutableArrayBufferPrototype ||
      assert.fail(X`Malformed ByteArray ${candidate}`, TypeError);
    apply(immutableGetter, candidate, []) ||
      Fail`Must be an immutable ArrayBuffer: ${candidate}`;
    ownKeys(candidate).length === 0 ||
      assert.fail(
        X`ByteArrays must not have own properties: ${candidate}`,
        TypeError,
      );
  },
});$h͏_once.ByteArrayHelper(ByteArrayHelper);
})()
,
// === 25. pass-style ./src/copyRecord.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,confirmOwnDataDescriptor,canBeMethod;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./passStyle-helpers.js", [["confirmOwnDataDescriptor",[$h͏_a => (confirmOwnDataDescriptor = $h͏_a)]]]],["./remotable.js", [["canBeMethod",[$h͏_a => (canBeMethod = $h͏_a)]]]]]);




/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 */

const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 */
const confirmObjectPrototype = (candidate, reject) => {
  return (
    getPrototypeOf(candidate) === objectPrototype ||
    (reject && reject`Records must inherit from Object.prototype: ${candidate}`)
  );
};

/**
 * @param {unknown} candidate
 * @param {PropertyKey} key
 * @param {unknown} value
 * @param {Rejector} reject
 */
const confirmPropertyCanBeValid = (candidate, key, value, reject) => {
  return (
    (typeof key === 'string' ||
      (reject &&
        reject`Records can only have string-named properties: ${candidate}`)) &&
    (!canBeMethod(value) ||
      (reject &&
        // TODO: Update message now that there is no such thing as "implicit Remotable".
        reject`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`))
  );
};

/**
 *
 * @type {PassStyleHelper}
 */
       const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  confirmCanBeValid: (candidate, reject) => {
    return (
      confirmObjectPrototype(candidate, reject) &&
      // Reject any candidate with a symbol-keyed property or method-like property
      // (such input is potentially a Remotable).
      ownKeys(candidate).every(key =>
        confirmPropertyCanBeValid(candidate, key, candidate[key], reject),
      )
    );
  },

  assertRestValid: (candidate, passStyleOfRecur) => {
    // Validate that each own property has a recursively passable associated
    // value (we already know from confirmCanBeValid that the other constraints are
    // satisfied).
    for (const name of ownKeys(candidate)) {
      const { value } = confirmOwnDataDescriptor(candidate, name, true, Fail);
      passStyleOfRecur(value);
    }
  },
});$h͏_once.CopyRecordHelper(CopyRecordHelper);
})()
,
// === 26. pass-style ./src/tagged.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,confirmTagRecord,PASS_STYLE,confirmOwnDataDescriptor,confirmPassStyle;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./passStyle-helpers.js", [["confirmTagRecord",[$h͏_a => (confirmTagRecord = $h͏_a)]],["PASS_STYLE",[$h͏_a => (PASS_STYLE = $h͏_a)]],["confirmOwnDataDescriptor",[$h͏_a => (confirmOwnDataDescriptor = $h͏_a)]],["confirmPassStyle",[$h͏_a => (confirmPassStyle = $h͏_a)]]]]]);








/**
 * @import {PassStyleHelper} from './internal-types.js'
 */

const { ownKeys } = Reflect;
const { getOwnPropertyDescriptors } = Object;

/**
 *
 * @type {PassStyleHelper}
 */
       const TaggedHelper = harden({
  styleName: 'tagged',

  confirmCanBeValid: (candidate, reject) =>
    confirmPassStyle(candidate, candidate[PASS_STYLE], 'tagged', reject),

  assertRestValid: (candidate, passStyleOfRecur) => {
    confirmTagRecord(candidate, 'tagged', Fail);

    // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
    const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
    const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
    const {
      // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
      [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
      [/** @type {string} */ (tagKey)]: _labelDesc,
      payload: _payloadDesc, // value checked by recursive walk at the end
      ...restDescs
    } = getOwnPropertyDescriptors(candidate);
    ownKeys(restDescs).length === 0 ||
      Fail`Unexpected properties on tagged record ${ownKeys(restDescs)}`;

    // Validate that the 'payload' property is own/data/enumerable
    // and its associated value is recursively passable.
    passStyleOfRecur(
      confirmOwnDataDescriptor(candidate, 'payload', true, Fail).value,
    );
  },
});$h͏_once.TaggedHelper(TaggedHelper);
})()
,
// === 27. pass-style ./src/safe-promise.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,isPromise,Fail,q,hideAndHardenFunction;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/promise-kit", [["isPromise",[$h͏_a => (isPromise = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);



/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 */

const { isFrozen, getPrototypeOf, getOwnPropertyDescriptor, hasOwn } = Object;
const { ownKeys } = Reflect;
const { toStringTag } = Symbol;

/**
 * @param {Promise} pr The value to examine
 * @param {Rejector} reject
 * @returns {pr is Promise} Whether it is a safe promise
 */
const confirmPromiseOwnKeys = (pr, reject) => {
  const keys = ownKeys(pr);

  if (keys.length === 0) {
    return true;
  }

  /**
   * This excludes those symbol-named own properties that are also found on
   * `Promise.prototype`, so that overrides of these properties can be
   * explicitly tolerated if they pass the `checkSafeOwnKey` check below.
   * In particular, we wish to tolerate
   *   * An overriding `toStringTag` non-enumerable data property
   *     with a string value.
   *   * Those own properties that might be added by Node's async_hooks.
   */
  const unknownKeys = keys.filter(
    key => typeof key !== 'symbol' || !hasOwn(Promise.prototype, key),
  );

  if (unknownKeys.length !== 0) {
    return (
      reject &&
      reject`${pr} - Must not have any own properties: ${q(unknownKeys)}`
    );
  }

  /**
   * Explicitly tolerate a `toStringTag` symbol-named non-enumerable
   * data property whose value is a string. Otherwise, tolerate those
   * symbol-named properties that might be added by NodeJS's async_hooks,
   * if they obey the expected safety properties.
   *
   * At the time of this writing, Node's async_hooks contains the
   * following code, which we can safely tolerate
   *
   * ```js
   * function destroyTracking(promise, parent) {
   *   trackPromise(promise, parent);
   *   const asyncId = promise[async_id_symbol];
   *   const destroyed = { destroyed: false };
   *   promise[destroyedSymbol] = destroyed;
   *   registerDestroyHook(promise, asyncId, destroyed);
   * }
   * ```
   *
   * @param {string|symbol} key
   */
  const checkSafeOwnKey = key => {
    if (key === toStringTag) {
      // TODO should we also enforce anything on the contents of the string,
      // such as that it must start with `'Promise'`?
      const tagDesc = getOwnPropertyDescriptor(pr, toStringTag);
      assert(tagDesc !== undefined);
      return (
        (hasOwn(tagDesc, 'value') ||
          (reject &&
            reject`Own @@toStringTag must be a data property, not an accessor: ${q(tagDesc)}`)) &&
        (typeof tagDesc.value === 'string' ||
          (reject &&
            reject`Own @@toStringTag value must be a string: ${q(tagDesc.value)}`)) &&
        (!tagDesc.enumerable ||
          (reject &&
            reject`Own @@toStringTag must not be enumerable: ${q(tagDesc)}`))
      );
    }
    const val = pr[key];
    if (val === undefined || typeof val === 'number') {
      return true;
    }
    if (
      typeof val === 'object' &&
      val !== null &&
      isFrozen(val) &&
      getPrototypeOf(val) === Object.prototype
    ) {
      const subKeys = ownKeys(val);
      if (subKeys.length === 0) {
        return true;
      }

      if (
        subKeys.length === 1 &&
        subKeys[0] === 'destroyed' &&
        val.destroyed === false
      ) {
        return true;
      }
    }
    return (
      reject &&
      reject`Unexpected Node async_hooks additions to promise: ${pr}.${q(
        String(key),
      )} is ${val}`
    );
  };

  return keys.every(checkSafeOwnKey);
};

/**
 * Under Hardened JS a promise is "safe" if its `then` method can be called
 * synchronously without giving the promise an opportunity for a
 * reentrancy attack during that call.
 *
 * https://github.com/Agoric/agoric-sdk/issues/9
 * raises the issue of testing that a specimen is a safe promise
 * such that the test also does not give the specimen a
 * reentrancy opportunity. That is well beyond the ambition here.
 * TODO Though if we figure out a nice solution, it might be good to
 * use it here as well.
 *
 * @param {unknown} pr The value to examine
 * @param {Rejector} reject
 * @returns {pr is Promise} Whether it is a safe promise
 */
const confirmSafePromise = (pr, reject) => {
  return (
    (isFrozen(pr) || (reject && reject`${pr} - Must be frozen`)) &&
    (isPromise(pr) || (reject && reject`${pr} - Must be a promise`)) &&
    (getPrototypeOf(pr) === Promise.prototype ||
      (reject &&
        reject`${pr} - Must inherit from Promise.prototype: ${q(
          getPrototypeOf(pr),
        )}`)) &&
    confirmPromiseOwnKeys(/** @type {Promise} */ (pr), reject)
  );
};
harden(confirmSafePromise);

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} pr The value to examine
 * @returns {pr is Promise} Whether it is a promise
 */
       const isSafePromise = pr => confirmSafePromise(pr, false);$h͏_once.isSafePromise(isSafePromise);
hideAndHardenFunction(isSafePromise);

       const assertSafePromise = pr => confirmSafePromise(pr, Fail);$h͏_once.assertSafePromise(assertSafePromise);
hideAndHardenFunction(assertSafePromise);
})()
,
// === 28. pass-style ./src/passStyleOf.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,isPromise,X,Fail,q,annotateError,makeError,hideAndHardenFunction,isPrimitive,isTypedArray,PASS_STYLE,CopyArrayHelper,ByteArrayHelper,CopyRecordHelper,TaggedHelper,ErrorHelper,confirmRecursivelyPassableError,confirmRecursivelyPassableErrorPropertyDesc,getErrorConstructor,isErrorLike,RemotableHelper,assertPassableSymbol,assertSafePromise,assertPassableString;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/promise-kit", [["isPromise",[$h͏_a => (isPromise = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["annotateError",[$h͏_a => (annotateError = $h͏_a)]],["makeError",[$h͏_a => (makeError = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["./passStyle-helpers.js", [["isPrimitive",[$h͏_a => (isPrimitive = $h͏_a)]],["isTypedArray",[$h͏_a => (isTypedArray = $h͏_a)]],["PASS_STYLE",[$h͏_a => (PASS_STYLE = $h͏_a)]]]],["./copyArray.js", [["CopyArrayHelper",[$h͏_a => (CopyArrayHelper = $h͏_a)]]]],["./byteArray.js", [["ByteArrayHelper",[$h͏_a => (ByteArrayHelper = $h͏_a)]]]],["./copyRecord.js", [["CopyRecordHelper",[$h͏_a => (CopyRecordHelper = $h͏_a)]]]],["./tagged.js", [["TaggedHelper",[$h͏_a => (TaggedHelper = $h͏_a)]]]],["./error.js", [["ErrorHelper",[$h͏_a => (ErrorHelper = $h͏_a)]],["confirmRecursivelyPassableError",[$h͏_a => (confirmRecursivelyPassableError = $h͏_a)]],["confirmRecursivelyPassableErrorPropertyDesc",[$h͏_a => (confirmRecursivelyPassableErrorPropertyDesc = $h͏_a)]],["getErrorConstructor",[$h͏_a => (getErrorConstructor = $h͏_a)]],["isErrorLike",[$h͏_a => (isErrorLike = $h͏_a)]]]],["./remotable.js", [["RemotableHelper",[$h͏_a => (RemotableHelper = $h͏_a)]]]],["./symbol.js", [["assertPassableSymbol",[$h͏_a => (assertPassableSymbol = $h͏_a)]]]],["./safe-promise.js", [["assertSafePromise",[$h͏_a => (assertSafePromise = $h͏_a)]]]],["./string.js", [["assertPassableString",[$h͏_a => (assertPassableString = $h͏_a)]]]]]);






























/** @import {PassStyleHelper} from './internal-types.js' */
/** @import {CopyArray, CopyRecord, CopyTagged, Passable} from './types.js' */
/** @import {PassStyle} from './types.js' */
/** @import {PassStyleOf} from './types.js' */

const { ownKeys } = Reflect;
const { isFrozen, getOwnPropertyDescriptors, values } = Object;

/**
 * @template {Record<PassStyle, PassStyleHelper>} HelpersRecord
 * @param {PassStyleHelper[]} passStyleHelpers
 * @returns {HelpersRecord}
 */
const makeHelperTable = passStyleHelpers => {
  const HelperTable = {
    __proto__: null,
    copyArray: undefined,
    byteArray: undefined,
    copyRecord: undefined,
    tagged: undefined,
    error: undefined,
    remotable: undefined,
  };
  for (const helper of passStyleHelpers) {
    const { styleName } = helper;
    styleName in HelperTable || Fail`Unrecognized helper: ${q(styleName)}`;
    HelperTable[styleName] === undefined ||
      Fail`conflicting helpers for ${q(styleName)}`;
    HelperTable[styleName] = helper;
  }
  for (const styleName of ownKeys(HelperTable)) {
    HelperTable[styleName] !== undefined ||
      Fail`missing helper for ${q(styleName)}`;
  }

  return /** @type {HelpersRecord} */ (
    /** @type {unknown} */ (harden(HelperTable))
  );
};

/**
 * The `assertRestValid` assumes that the `confirmCanBeValid` check has already passed.
 * Contexts where we cannot assume that should call `assertValid` instead,
 * which checks both conditions in the right order.
 *
 * @param {PassStyleHelper} helper
 * @param {any} candidate
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @returns {void}
 */
const assertValid = (helper, candidate, passStyleOfRecur) => {
  helper.confirmCanBeValid(candidate, Fail);
  helper.assertRestValid(candidate, passStyleOfRecur);
};

/**
 * @param {PassStyleHelper[]} passStyleHelpers The passStyleHelpers to register,
 * in priority order.
 * NOTE These must all be "trusted",
 * complete, and non-colliding. `makePassStyleOf` may *assume* that each helper
 * does what it is supposed to do. `makePassStyleOf` is not trying to defend
 * itself against malicious helpers, though it does defend against some
 * accidents.
 * @returns {PassStyleOf}
 */
const makePassStyleOf = passStyleHelpers => {
  const HelperTable = makeHelperTable(passStyleHelpers);
  const remotableHelper = HelperTable.remotable;

  /**
   * Purely for performance. However it is mutable static state, and
   * it does have some observability on proxies. TODO need to assess
   * whether this creates a static communications channel.
   *
   * passStyleOf does a full recursive walk of pass-by-copy
   * structures, in order to validate that they are acyclic. In addition
   * it is used by other algorithms to recursively walk these pass-by-copy
   * structures, so without this cache, these algorithms could be
   * O(N**2) or worse.
   *
   * @type {WeakMap<WeakKey, PassStyle>}
   */
  const passStyleMemo = new WeakMap();

  /**
   * @type {PassStyleOf}
   */
  // @ts-expect-error cast
  const passStyleOf = passable => {
    // Even when a WeakSet is correct, when the set has a shorter lifetime
    // than its keys, we prefer a Set due to expected implementation
    // tradeoffs.
    const inProgress = new Set();

    const passStyleOfRecur = inner => {
      const innerIsObject = !isPrimitive(inner);
      if (innerIsObject) {
        const innerStyle = passStyleMemo.get(inner);
        if (innerStyle) {
          return innerStyle;
        }
        !inProgress.has(inner) ||
          Fail`Pass-by-copy data cannot be cyclic ${inner}`;
        inProgress.add(inner);
      }
      // eslint-disable-next-line no-use-before-define
      const passStyle = passStyleOfInternal(inner);
      if (innerIsObject) {
        passStyleMemo.set(inner, passStyle);
        inProgress.delete(inner);
      }
      return passStyle;
    };

    const passStyleOfInternal = inner => {
      const typestr = typeof inner;
      switch (typestr) {
        case 'undefined':
        case 'boolean':
        case 'number':
        case 'bigint': {
          return typestr;
        }
        case 'string': {
          assertPassableString(inner);
          return 'string';
        }
        case 'symbol': {
          assertPassableSymbol(inner);
          return 'symbol';
        }
        case 'object': {
          if (inner === null) {
            return 'null';
          }
          if (!isFrozen(inner)) {
            assert.fail(
              // TypedArrays get special treatment in harden()
              // and a corresponding special error message here.
              isTypedArray(inner)
                ? X`Cannot pass mutable typed arrays like ${inner}.`
                : X`Cannot pass non-frozen objects like ${inner}. Use harden()`,
            );
          }
          if (isPromise(inner)) {
            assertSafePromise(inner);
            return 'promise';
          }
          typeof inner.then !== 'function' ||
            Fail`Cannot pass non-promise thenables`;
          const passStyleTag = inner[PASS_STYLE];
          if (passStyleTag !== undefined) {
            assert.typeof(passStyleTag, 'string');
            const helper = HelperTable[passStyleTag];
            helper !== undefined ||
              Fail`Unrecognized PassStyle: ${q(passStyleTag)}`;
            assertValid(helper, inner, passStyleOfRecur);
            return /** @type {PassStyle} */ (passStyleTag);
          }
          for (const helper of passStyleHelpers) {
            if (helper.confirmCanBeValid(inner, false)) {
              helper.assertRestValid(inner, passStyleOfRecur);
              return helper.styleName;
            }
          }
          assertValid(remotableHelper, inner, passStyleOfRecur);
          return 'remotable';
        }
        case 'function': {
          isFrozen(inner) ||
            Fail`Cannot pass non-frozen objects like ${inner}. Use harden()`;
          typeof inner.then !== 'function' ||
            Fail`Cannot pass non-promise thenables`;
          assertValid(remotableHelper, inner, passStyleOfRecur);
          return 'remotable';
        }
        default: {
          throw assert.fail(X`Unrecognized typeof ${q(typestr)}`, TypeError);
        }
      }
    };

    return passStyleOfRecur(passable);
  };
  return harden(passStyleOf);
};

       const PassStyleOfEndowmentSymbol = Symbol.for('@endo passStyleOf');

/**
 * If there is already a PassStyleOfEndowmentSymbol property on the global,
 * then presumably it was endowed for us by liveslots with a `passStyleOf`
 * function, so we should use and export that one instead.
 * Other software may have left it for us here,
 * but it would require write access to our global, or the ability to
 * provide endowments to our global, both of which seems adequate as a test of
 * whether it is authorized to serve the same role as liveslots.
 *
 * NOTE HAZARD: This use by liveslots does rely on `passStyleOf` being
 * deterministic. If it is not, then in a liveslot-like virtualized
 * environment, it can be used to detect GC.
 *
 * @type {PassStyleOf}
 */$h͏_once.PassStyleOfEndowmentSymbol(PassStyleOfEndowmentSymbol);
       const passStyleOf =
  (globalThis && globalThis[PassStyleOfEndowmentSymbol]) ||
  makePassStyleOf([
    CopyArrayHelper,
    ByteArrayHelper,
    CopyRecordHelper,
    TaggedHelper,
    ErrorHelper,
    RemotableHelper,
  ]);$h͏_once.passStyleOf(passStyleOf);

       const assertPassable = val => {
  passStyleOf(val); // throws if val is not a passable
};$h͏_once.assertPassable(assertPassable);
hideAndHardenFunction(assertPassable);

/**
 * Is `specimen` Passable? This returns true iff `passStyleOf(specimen)`
 * returns a string. This returns `false` iff `passStyleOf(specimen)` throws.
 * Under no normal circumstance should `isPassable(specimen)` throw.
 *
 * TODO Deprecate and ultimately delete @agoric/base-zone's `isPassable' in
 * favor of this one.
 * See https://github.com/endojs/endo/issues/2096
 *
 * TODO implement an isPassable that does not rely on try/catch.
 * This implementation is just a standin until then.
 * See https://github.com/endojs/endo/issues/2096
 *
 * @param {any} specimen
 * @returns {specimen is Passable}
 */
       const isPassable = specimen => {
  try {
    // In fact, it never returns undefined. It either returns a
    // string or throws.
    return passStyleOf(specimen) !== undefined;
  } catch (_) {
    return false;
  }
};$h͏_once.isPassable(isPassable);
hideAndHardenFunction(isPassable);

/**
 * @param {string} name
 * @param {PropertyDescriptor} desc
 * @returns {boolean}
 */
const isPassableErrorPropertyDesc = (name, desc) =>
  confirmRecursivelyPassableErrorPropertyDesc(name, desc, passStyleOf, false);

/**
 * After hardening, if `err` is a passable error, return it.
 *
 * Otherwise, return a new passable error that propagates the diagnostic
 * info of the original, and is linked to the original as a note.
 *
 * TODO Adopt a more flexible notion of passable error, in which
 * a passable error can contain other own data properties with
 * throwable values.
 *
 * @param {Error} err
 * @returns {Error}
 */
       const toPassableError = err => {
  harden(err);
  if (confirmRecursivelyPassableError(err, passStyleOf, false)) {
    return err;
  }
  const { name, message } = err;
  const { cause: causeDesc, errors: errorsDesc } =
    getOwnPropertyDescriptors(err);
  let cause;
  let errors;
  if (causeDesc && isPassableErrorPropertyDesc('cause', causeDesc)) {
    cause = causeDesc.value;
  }
  if (errorsDesc && isPassableErrorPropertyDesc('errors', errorsDesc)) {
    errors = errorsDesc.value;
  }

  const errConstructor = getErrorConstructor(`${name}`) || Error;
  const newError = makeError(`${message}`, errConstructor, {
    // @ts-ignore Assuming cause is Error | undefined
    cause,
    errors,
  });
  // Still needed, because `makeError` only does a shallow freeze.
  harden(newError);
  // Even the cleaned up error copy, if sent to the console, should
  // cause hidden diagnostic information of the original error
  // to be logged.
  annotateError(newError, X`copied from error ${err}`);
  passStyleOf(newError) === 'error' ||
    Fail`Expected ${newError} to be a passable error`;
  return newError;
};$h͏_once.toPassableError(toPassableError);
harden(toPassableError);

/**
 * After hardening, if `specimen` is throwable, return it.
 * A specimen is throwable iff it is Passable and contains no PassableCaps,
 * i.e., no Remotables or Promises.
 * IOW, if it contains only copy-data and passable errors.
 *
 * Otherwise, if `specimen` is *almost* throwable, for example, it is
 * an error that can be made throwable by `toPassableError`, then
 * return `specimen` converted to a throwable.
 *
 * Otherwise, throw a diagnostic indicating a failure to coerce.
 *
 * This is in support of the exo boundary throwing only throwables, to ease
 * security review.
 *
 * TODO Adopt a more flexitble notion of throwable, in which
 * data containers containing non-passable errors can themselves be coerced
 * to throwable by coercing to a similar containers containing
 * the results of coercing those errors to passable errors.
 *
 * @param {unknown} specimen
 * @returns {Passable<never, Error>}
 */
       const toThrowable = specimen => {
  harden(specimen);
  if (isErrorLike(specimen)) {
    return toPassableError(/** @type {Error} */ (specimen));
  }
  if (!isPrimitive(specimen)) {
    // Note that this step will fail if `specimen` would be a passable container
    // except that it contains non-passable errors that could be converted.
    // This will need to be fixed to do the TODO above.
    const passStyle = /** @type {PassStyle} */ (passStyleOf(specimen));
    switch (passStyle) {
      case 'copyArray': {
        const elements = /** @type {CopyArray} */ (specimen);
        for (const element of elements) {
          element === toThrowable(element) ||
            Fail`nested toThrowable coercion not yet supported ${element}`;
        }
        break;
      }
      case 'copyRecord': {
        const rec = /** @type {CopyRecord} */ (specimen);
        for (const val of values(rec)) {
          val === toThrowable(val) ||
            Fail`nested toThrowable coercion not yet supported ${val}`;
        }
        break;
      }
      case 'tagged': {
        const tg = /** @type {CopyTagged} */ (specimen);
        const { payload } = tg;
        payload === toThrowable(payload) ||
          Fail`nested toThrowable coercion not yet supported ${payload}`;
        break;
      }
      case 'error': {
        const er = /** @type {Error} */ (specimen);
        er === toThrowable(er) ||
          Fail`nested toThrowable coercion not yet supported ${er}`;
        break;
      }
      default: {
        throw Fail`A ${q(passStyle)} is not throwable: ${specimen}`;
      }
    }
  }
  return /** @type {Passable<never,never>} */ (specimen);
};$h͏_once.toThrowable(toThrowable);
harden(toThrowable);
})()
,
// === 29. pass-style ./src/makeTagged.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,PASS_STYLE,assertPassable;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./passStyle-helpers.js", [["PASS_STYLE",[$h͏_a => (PASS_STYLE = $h͏_a)]]]],["./passStyleOf.js", [["assertPassable",[$h͏_a => (assertPassable = $h͏_a)]]]]]);




/**
 * @import {Passable,CopyTagged} from './types.js'
 */

const { create, prototype: objectPrototype } = Object;

/**
 * @template {string} T
 * @template {Passable} P
 * @param {T} tag
 * @param {P} payload
 * @returns {CopyTagged<T,P>}
 */
       const makeTagged = (tag, payload) => {
  typeof tag === 'string' ||
    Fail`The tag of a tagged record must be a string: ${tag}`;
  assertPassable(harden(payload));
  return harden(
    create(objectPrototype, {
      [PASS_STYLE]: { value: 'tagged' },
      [Symbol.toStringTag]: { value: tag },
      payload: { value: payload, enumerable: true },
    }),
  );
};$h͏_once.makeTagged(makeTagged);
harden(makeTagged);
})()
,
// === 30. pass-style ./src/typeGuards.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let Fail,q,hideAndHardenFunction,passStyleOf;$h͏_imports([["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["./passStyleOf.js", [["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]]]]]);


/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {CopyArray, CopyRecord, Passable, RemotableObject, ByteArray, Atom} from './types.js'
 */

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {any} arr
 * @returns {arr is CopyArray<any>}
 */
       const isCopyArray = arr => passStyleOf(arr) === 'copyArray';$h͏_once.isCopyArray(isCopyArray);
hideAndHardenFunction(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy binary data, AKA a "byteArray"
 * in @endo/marshal terms
 *
 * @param {Passable} arr
 * @returns {arr is ByteArray}
 */
       const isByteArray = arr => passStyleOf(arr) === 'byteArray';$h͏_once.isByteArray(isByteArray);
hideAndHardenFunction(isByteArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {any} record
 * @returns {record is CopyRecord<any>}
 */
       const isRecord = record => passStyleOf(record) === 'copyRecord';$h͏_once.isRecord(isRecord);
hideAndHardenFunction(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is RemotableObject}
 */
       const isRemotable = remotable => passStyleOf(remotable) === 'remotable';$h͏_once.isRemotable(isRemotable);
hideAndHardenFunction(isRemotable);

/**
 * @param {any} arr
 * @param {string=} optNameOfArray
 * @returns {asserts arr is CopyArray<any>}
 */
       const assertCopyArray = (arr, optNameOfArray = 'Alleged array') => {
  const passStyle = passStyleOf(arr);
  passStyle === 'copyArray' ||
    Fail`${q(optNameOfArray)} ${arr} must be a pass-by-copy array, not ${q(
      passStyle,
    )}`;
};$h͏_once.assertCopyArray(assertCopyArray);
hideAndHardenFunction(assertCopyArray);

/**
 * @param {Passable} arr
 * @param {string=} optNameOfArray
 * @returns {asserts arr is ByteArray}
 */
       const assertByteArray = (arr, optNameOfArray = 'Alleged byteArray') => {
  const passStyle = passStyleOf(arr);
  passStyle === 'byteArray' ||
    Fail`${q(
      optNameOfArray,
    )} ${arr} must be a pass-by-copy binary data, not ${q(passStyle)}`;
};$h͏_once.assertByteArray(assertByteArray);
hideAndHardenFunction(assertByteArray);

/**
 * @callback AssertRecord
 * @param {any} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */
       const assertRecord = (record, optNameOfRecord = 'Alleged record') => {
  const passStyle = passStyleOf(record);
  passStyle === 'copyRecord' ||
    Fail`${q(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q(
      passStyle,
    )}`;
};$h͏_once.assertRecord(assertRecord);
hideAndHardenFunction(assertRecord);

/**
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is RemotableObject}
 */
       const assertRemotable = (
  remotable,
  optNameOfRemotable = 'Alleged remotable',
) => {
  const passStyle = passStyleOf(remotable);
  passStyle === 'remotable' ||
    Fail`${q(optNameOfRemotable)} ${remotable} must be a remotable, not ${q(
      passStyle,
    )}`;
};$h͏_once.assertRemotable(assertRemotable);
hideAndHardenFunction(assertRemotable);

/**
 * @param {any} val Not necessarily passable
 * @param {Rejector} reject
 * @returns {val is Atom}
 */
const confirmAtom = (val, reject) => {
  let passStyle;
  try {
    passStyle = passStyleOf(val);
  } catch (err) {
    return reject && reject`Not even Passable: ${q(err)}: ${val}`;
  }
  switch (passStyle) {
    case 'undefined':
    case 'null':
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'string':
    case 'byteArray':
    case 'symbol': {
      // The AtomStyle cases
      return true;
    }
    default: {
      // The other PassStyle cases
      return reject && reject`A ${q(passStyle)} cannot be an atom: ${val}`;
    }
  }
};

/**
 * @param {any} val
 * @returns {val is Atom}
 */
       const isAtom = val => confirmAtom(val, false);$h͏_once.isAtom(isAtom);
hideAndHardenFunction(isAtom);

/**
 * @param {Passable} val
 * @returns {asserts val is Atom}
 */
       const assertAtom = val => {
  confirmAtom(val, Fail);
};$h͏_once.assertAtom(assertAtom);
hideAndHardenFunction(assertAtom);
})()
,
// === 31. eventual-send ./src/track-turns.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let getEnvironmentOption,environmentOptionsListHas;$h͏_imports([["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getEnvironmentOption = $h͏_a)]],["environmentOptionsListHas",[$h͏_a => (environmentOptionsListHas = $h͏_a)]]]]]);





// NOTE: We can't import these because they're not in scope before lockdown.
// We also cannot currently import them because it would create a cyclic
// dependency, though this is more easily fixed.
// import { assert, X, Fail } from '@endo/errors';
// See also https://github.com/Agoric/agoric-sdk/issues/9515

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.

let hiddenPriorError;
let hiddenCurrentTurn = 0;
let hiddenCurrentEvent = 0;

// Turn on if you seem to be losing error logging at the top of the event loop
const VERBOSE = environmentOptionsListHas('DEBUG', 'track-turns');

// Track-turns is disabled by default and can be enabled by an environment
// option.
const ENABLED =
  /** @type {'disabled' | 'enabled'} */
  (getEnvironmentOption('TRACK_TURNS', 'disabled', ['enabled'])) === 'enabled';

// We hoist the following functions out of trackTurns() to discourage the
// closures from holding onto 'args' or 'func' longer than necessary,
// which we've seen cause HandledPromise arguments to be retained for
// a surprisingly long time.

const addRejectionNote = detailsNote => reason => {
  if (reason instanceof Error) {
    globalThis.assert.note(reason, detailsNote);
  }
  if (VERBOSE) {
    console.log('REJECTED at top of event loop', reason);
  }
};

const wrapFunction =
  (func, sendingError, X) =>
  (...args) => {
    hiddenPriorError = sendingError;
    hiddenCurrentTurn += 1;
    hiddenCurrentEvent = 0;
    try {
      let result;
      try {
        result = func(...args);
      } catch (err) {
        if (err instanceof Error) {
          globalThis.assert.note(
            err,
            X`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
          );
        }
        if (VERBOSE) {
          console.log('THROWN to top of event loop', err);
        }
        throw err;
      }
      // Must capture this now, not when the catch triggers.
      const detailsNote = X`Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
      Promise.resolve(result).catch(addRejectionNote(detailsNote));
      return result;
    } finally {
      hiddenPriorError = undefined;
    }
  };

/**
 * Given a list of `TurnStarterFn`s, returns a list of `TurnStarterFn`s whose
 * `this`-free call behaviors are not observably different to those that
 * cannot see console output. The only purpose is to cause additional
 * information to appear on the console.
 *
 * The call to `trackTurns` is itself a sending event, that occurs in some call
 * stack in some turn number at some event number within that turn. Each call
 * to any of the returned `TurnStartFn`s is a receiving event that begins a new
 * turn. This sending event caused each of those receiving events.
 *
 * @template {TurnStarterFn[]} T
 * @param {T} funcs
 * @returns {T}
 */
       const trackTurns = funcs => {
  if (!ENABLED || typeof globalThis === 'undefined' || !globalThis.assert) {
    return funcs;
  }
  const { details: X, note: annotateError } = globalThis.assert;

  hiddenCurrentEvent += 1;
  const sendingError = Error(
    `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
  );
  if (hiddenPriorError !== undefined) {
    annotateError(sendingError, X`Caused by: ${hiddenPriorError}`);
  }

  return /** @type {T} */ (
    funcs.map(func => func && wrapFunction(func, sendingError, X))
  );
};

/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 *
 * @typedef {((...args: any[]) => any) | undefined} TurnStarterFn
 */$h͏_once.trackTurns(trackTurns);
})()
,
// === 32. eventual-send ./src/E.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,trackTurns,makeMessageBreakpointTester;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./track-turns.js", [["trackTurns",[$h͏_a => (trackTurns = $h͏_a)]]]],["./message-breakpoints.js", [["makeMessageBreakpointTester",[$h͏_a => (makeMessageBreakpointTester = $h͏_a)]]]]]);



const { details: X, quote: q, Fail, error: makeError } = assert;
const { assign, freeze } = Object;

/**
 * @import { HandledPromiseConstructor, RemotableBrand, Callable, Settler } from './types.js';
 */

const onSend = makeMessageBreakpointTester('ENDO_SEND_BREAKPOINTS');

/** @type {ProxyHandler<any>} */
const baseFreezableProxyHandler = {
  set(_target, _prop, _value) {
    return false;
  },
  isExtensible(_target) {
    return false;
  },
  setPrototypeOf(_target, _value) {
    return false;
  },
  deleteProperty(_target, _prop) {
    return false;
  },
};

// E Proxy handlers pretend that any property exists on the target and returns
// a function for their value. While this function is "bound" by context, it is
// meant to be called as a method. For that reason, the returned function
// includes a check that the `this` argument corresponds to the initial
// receiver when the function was retrieved.
// E Proxy handlers also forward direct calls to the target in case the remote
// is a function instead of an object. No such receiver checks are necessary in
// that case.

/**
 * A Proxy handler for E(x).
 *
 * @param {any} recipient Any value passed to E(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeEProxyHandler = (recipient, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => Promise<unknown>} */
          [propertyKey](...args) {
            if (this !== receiver) {
              // Reject the async function call
              return HandledPromise.reject(
                makeError(
                  X`Unexpected receiver for "${q(propertyKey)}" method of E(${q(
                    recipient,
                  )})`,
                ),
              );
            }

            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              // eslint-disable-next-line no-debugger
              debugger; // LOOK UP THE STACK
              // Stopped at a breakpoint on eventual-send of a method-call
              // message,
              // so that you can walk back on the stack to see how we came to
              // make this eventual-send
            }
            return HandledPromise.applyMethod(recipient, propertyKey, args);
          }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey],
      );
    },
    apply: (_target, _thisArg, argArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, undefined)) {
        // eslint-disable-next-line no-debugger
        debugger; // LOOK UP THE STACK
        // Stopped at a breakpoint on eventual-send of a function-call message,
        // so that you can walk back on the stack to see how we came to
        // make this eventual-send
      }
      return HandledPromise.applyFunction(recipient, argArray);
    },
    has: (_target, _p) => {
      // We just pretend everything exists.
      return true;
    },
  });

/**
 * A Proxy handler for E.sendOnly(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {any} recipient Any value passed to E.sendOnly(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeESendOnlyProxyHandler = (recipient, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => undefined} */
          [propertyKey](...args) {
            // Throw since the function returns nothing
            this === receiver ||
              Fail`Unexpected receiver for "${q(
                propertyKey,
              )}" method of E.sendOnly(${q(recipient)})`;
            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              // eslint-disable-next-line no-debugger
              debugger; // LOOK UP THE STACK
              // Stopped at a breakpoint on eventual-send of a method-call
              // message,
              // so that you can walk back on the stack to see how we came to
              // make this eventual-send
            }
            HandledPromise.applyMethodSendOnly(recipient, propertyKey, args);
            return undefined;
          }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey],
      );
    },
    apply: (_target, _thisArg, argsArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, undefined)) {
        // eslint-disable-next-line no-debugger
        debugger; // LOOK UP THE STACK
        // Stopped at a breakpoint on eventual-send of a function-call message,
        // so that you can walk back on the stack to see how we came to
        // make this eventual-send
      }
      HandledPromise.applyFunctionSendOnly(recipient, argsArray);
      return undefined;
    },
    has: (_target, _p) => {
      // We just pretend that everything exists.
      return true;
    },
  });

/**
 * A Proxy handler for E.get(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {any} x Any value passed to E.get(x)
 * @param {HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler<unknown>} the Proxy handler
 */
const makeEGetProxyHandler = (x, HandledPromise) =>
  harden({
    ...baseFreezableProxyHandler,
    has: (_target, _prop) => true,
    get: (_target, prop) => HandledPromise.get(x, prop),
  });

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const funcTarget = freeze(() => {});

/**
/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const objTarget = freeze({ __proto__: null });

/**
 * @param {HandledPromiseConstructor} HandledPromise
 */
const makeE = HandledPromise => {
  return harden(
    assign(
      /**
       * E(x) returns a proxy on which you can call arbitrary methods. Each of these
       * method calls returns a promise. The method will be invoked on whatever
       * 'x' designates (or resolves to) in a future turn, not this one.
       *
       * An example call would be
       *
       * E(zoe).install(bundle)
       *   .then(installationHandle => { ... })
       *   .catch(err => { ... });
       *
       *  See https://endojs.github.io/endo/functions/_endo_far.E.html for details.
       *
       * @template T
       * @param {T} x target for method/function call
       * @returns {ECallableOrMethods<RemoteFunctions<T>>} method/function call proxy
       */
      // @ts-expect-error XXX typedef
      x => new Proxy(funcTarget, makeEProxyHandler(x, HandledPromise)),
      {
        /**
         * E.get(x) returns a proxy on which you can get arbitrary properties.
         * Each of these properties returns a promise for the property.  The promise
         * value will be the property fetched from whatever 'x' designates (or
         * resolves to) in a future turn, not this one.
         *
         * @template T
         * @param {T} x target for property get
         * @returns {EGetters<LocalRecord<T>>} property get proxy
         * @readonly
         */
        // @ts-expect-error XXX typedef
        get: x => new Proxy(objTarget, makeEGetProxyHandler(x, HandledPromise)),

        /**
         * E.resolve(x) converts x to a handled promise. It is
         * shorthand for HandledPromise.resolve(x)
         *
         * @template T
         * @param {T} x value to convert to a handled promise
         * @returns {Promise<Awaited<T>>} handled promise for x
         * @readonly
         */
        resolve: HandledPromise.resolve,

        /**
         * E.sendOnly returns a proxy similar to E, but for which the results
         * are ignored (undefined is returned).
         *
         * @template T
         * @param {T} x target for method/function call
         * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
         * @readonly
         */
        sendOnly: x =>
          // @ts-expect-error XXX typedef
          new Proxy(funcTarget, makeESendOnlyProxyHandler(x, HandledPromise)),

        /**
         * E.when(x, res, rej) is equivalent to
         * HandledPromise.resolve(x).then(res, rej)
         *
         * @template T
         * @template [U = T]
         * @param {T|PromiseLike<T>} x value to convert to a handled promise
         * @param {(value: T) => ERef<U>} [onfulfilled]
         * @param {(reason: any) => ERef<U>} [onrejected]
         * @returns {Promise<U>}
         * @readonly
         */
        when: (x, onfulfilled, onrejected) =>
          HandledPromise.resolve(x).then(
            ...trackTurns([onfulfilled, onrejected]),
          ),
      },
    ),
  );
};

const{default:$c͏_default}={default:makeE};

/** @typedef {ReturnType<makeE>} EProxy */

/**
 * Declare an object that is potentially a far reference of type Primary whose
 * auxilliary data has type Local.  This should be used only for consumers of
 * Far objects in arguments and declarations; the only creators of Far objects
 * are distributed object creator components like the `Far` or `Remotable`
 * functions.
 *
 * @template Primary The type of the primary reference.
 * @template [Local=DataOnly<Primary>] The local properties of the object.
 * @typedef {ERef<Local & RemotableBrand<Local, Primary>>} FarRef
 */

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 *
 * @template T The type to be filtered.
 * @typedef {Omit<T, FilteredKeys<T, Callable>>} DataOnly
 */

/**
 * @see {@link https://github.com/microsoft/TypeScript/issues/31394}
 * @template T
 * @typedef {PromiseLike<T> | T} ERef
 * Declare that `T` may or may not be a Promise.  This should be used only for
 * consumers of arguments and declarations; return values should specifically be
 * `Promise<T>` or `T` itself.
 */

/**
 * The awaited return type of a function.
 * For the eventual result of an E call, @see {EResult} or @see {ECallableReturn}
 *
 * @template {(...args: any[]) => any} T
 * @typedef {T extends (...args: any[]) => infer R ? Awaited<R> : never} EReturn
 */

/**
 * An eventual value where remotable objects are recursively mapped to Remote types
 *
 * @template T
 * @typedef {Awaited<T>} EResult
 */

/**
 * Experimental type mapping remotable objects to Remote types
 *
 * @template T
 * @typedef {(
 *   0 extends (1 & T)                                        // If T is any
 *     ? T                                                    // Propagate the any type through the result
 *     : T extends RemotableBrand<infer L, infer P>           // If we have a Remotable
 *       ? (P | RemotableBrand<L, P>)                         // map it to its "maybe remote" form (primary behavior or remotable presence)
 *       : T extends PromiseLike<infer U>                     // If T is a promise
 *         ? Promise<EAwaitedResult<Awaited<T>>>              // map its resolution
 *         : T extends (null | undefined | string | number | boolean | symbol | bigint | Callable) // Intersections of these types with objects are not mapped
 *           ? T                                              // primitives and non-remotable functions are passed-through
 *           : T extends object                               //
 *             ? { [P in keyof T]: EAwaitedResult<T[P]>; }    // other objects are considered copy data and properties mapped
 *             : T                                            // in case anything wasn't covered, fallback to pass-through
 * )} EAwaitedResult
 */

/**
 * The @see {EResult} return type of a remote function.
 *
 * @template {(...args: any[]) => any} T
 * @typedef {(
 *   0 extends (1 & T)                          // If T is any
 *     ? any                                    // Propagate the any type through the result
 *     : T extends (...args: any[]) => infer R  // Else infer the return type
 *       ? EResult<R>                           // In the future, map the eventual result
 *       : never
 * )} ECallableReturn
 */

// TODO: Figure out a way to map generic callable return types, or at least better detect them.
// See https://github.com/microsoft/TypeScript/issues/61838. Without that, `E(startGovernedUpgradable)`
// in agoric-sdk doesn't propagate the start function type.
/**
 * Maps a callable to its remotely called type
 *
 * @template {Callable} T
 * @typedef {(
 *    ReturnType<T> extends PromiseLike<infer U>                  // Check if callable returns a promise
 *      ? T                                                       // Bypass mapping to maintain any generic
 *      : (...args: Parameters<T>) => Promise<ECallableReturn<T>> // Map it anyway to ensure promise return type
 * )} ECallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends Callable
 *     ? ECallable<T[P]>
 *     : never;
 * }} EMethods
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends PromiseLike<infer U>
 *     ? T[P]
 *     : Promise<Awaited<T[P]>>;
 * }} EGetters
 */

/**
 * @template {Callable} T
 * @typedef {(...args: Parameters<T>) => Promise<void>} ESendOnlyCallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends Callable
 *     ? ESendOnlyCallable<T[P]>
 *     : never;
 * }} ESendOnlyMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends Callable
 *     ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
 *     : 0 extends (1 & T)
 *       ? never
 *       : ESendOnlyMethods<Required<T>>
 * )} ESendOnlyCallableOrMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends Callable
 *     ? ECallable<T> & EMethods<Required<T>>
 *     : 0 extends (1 & T)
 *       ? never
 *       : EMethods<Required<T>>
 * )} ECallableOrMethods
 */

/**
 * Return a union of property names/symbols/numbers P for which the record element T[P]'s type extends U.
 *
 * Given const x = { a: 123, b: 'hello', c: 42, 49: () => {}, 53: 67 },
 *
 * FilteredKeys<typeof x, number> is the type 'a' | 'c' | 53.
 * FilteredKeys<typeof x, string> is the type 'b'.
 * FilteredKeys<typeof x, 42 | 67> is the type 'c' | 53.
 * FilteredKeys<typeof x, boolean> is the type never.
 *
 * @template T
 * @template U
 * @typedef {{ [P in keyof T]: T[P] extends U ? P : never; }[keyof T]} FilteredKeys
 */

/**
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 *
 * @template T
 * @typedef {(
 *   T extends Callable
 *     ? (...args: Parameters<T>) => ReturnType<T>                     // a root callable, no methods
 *     : Pick<T, FilteredKeys<T, Callable>>          // any callable methods
 * )} PickCallable
 */

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 *
 * @template T
 * @typedef {(
 *   T extends RemotableBrand<infer L, infer R>   // if a given T is some remote interface R
 *     ? PickCallable<R>                          // then return the callable properties of R
 *     : T extends PromiseLike<infer U>           // otherwise, if T is a promise
 *       ? RemoteFunctions<U>                     // recurse on the resolved value of T
 *       : T                                      // otherwise, return T
 * )} RemoteFunctions
 */

/**
 * @template T
 * @typedef {(
 *   T extends RemotableBrand<infer L, infer R>
 *     ? L
 *     : T extends PromiseLike<infer U>
 *     ? LocalRecord<U>
 *     : T
 * )} LocalRecord
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   promise: Promise<R>;
 *   settler: Settler<R>;
 * }} EPromiseKit
 */

/**
 * Declare a near object that must only be invoked with E, even locally.  It
 * supports the `T` interface but additionally permits `T`'s methods to return
 * `PromiseLike`s even if `T` declares them as only synchronous.
 *
 * @template T
 * @typedef {(
 *   T extends Callable
 *     ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>>
 *     : T extends Record<PropertyKey, Callable>
 *     ? {
 *         [K in keyof T]: T[K] extends Callable
 *           ? (...args: Parameters<T[K]>) => ERef<Awaited<EOnly<ReturnType<T[K]>>>>
 *           : T[K];
 *       }
 *     : T
 * )} EOnly
 */$h͏_once.default($c͏_default);
})()
,
// === 33. eventual-send ./src/exports.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 34. eventual-send ./src/no-shim.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let makeE;$h͏_imports([["./E.js", [["default",[$h͏_a => (makeE = $h͏_a)]]]],["./exports.js", []]]);

// XXX module exports for HandledPromise fail if these aren't in scope
/** @import {Handler, HandledExecutor} from './handled-promise.js' */
/** @import {ECallableOrMethods, EGetters, ERef, ERemoteFunctions, ESendOnlyCallableOrMethods, LocalRecord, RemoteFunctions} from './E.js' */

const hp = HandledPromise;

/**
 * E(x) returns a proxy on which you can call arbitrary methods. Each of these method calls returns a promise.
 * The method will be invoked on whatever 'x' designates (or resolves to) in a future turn, not this one.
 *
 * E.get(x) returns a proxy on which you can get arbitrary properties. Each of these properties returns a
 * promise for the property.  The promise value will be the property fetched from whatever 'x' designates (or
 * resolves to) in a future turn, not this one.
 *
 * E.when(x, res, rej) is equivalent to HandledPromise.resolve(x).then(res, rej)
 */$h͏_once.hp(hp);
       const E = makeE(hp);$h͏_once.E(E);
})()
,
// === 35. pass-style ./src/deeplyFulfilled.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,X,q,E,isPromise,getTag,passStyleOf,makeTagged,isAtom;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]]]],["@endo/eventual-send", [["E",[$h͏_a => (E = $h͏_a)]]]],["@endo/promise-kit", [["isPromise",[$h͏_a => (isPromise = $h͏_a)]]]],["./passStyle-helpers.js", [["getTag",[$h͏_a => (getTag = $h͏_a)]]]],["./passStyleOf.js", [["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]]]],["./makeTagged.js", [["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]]]],["./typeGuards.js", [["isAtom",[$h͏_a => (isAtom = $h͏_a)]]]]]);








/**
 * @import {RemotableBrand} from '@endo/eventual-send';
 * @import {Passable, ByteArray, CopyRecord, CopyArray, CopyTagged, RemotableObject} from '@endo/pass-style'
 */

const { ownKeys } = Reflect;
const { fromEntries } = Object;

/**
 * Currently copied from @agoric/internal utils.js.
 * TODO Should migrate here and then, if needed, reexported there.
 *
 * @template T
 * @typedef {{ [KeyType in keyof T]: T[KeyType] } & {}} Simplify flatten the
 *   type output to improve type hints shown in editors
 *   https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
 */

/**
 * Currently copied from @agoric/internal utils.js.
 * TODO Should migrate here and then, if needed, reexported there.
 *
 * @typedef {(...args: any[]) => any} Callable
 */

/**
 * Currently copied from @agoric/internal utils.js.
 * TODO Should migrate here and then, if needed, reexported there.
 *
 * @template {{}} T
 * @typedef {{
 *   [K in keyof T]: T[K] extends Callable ? T[K] : DeeplyAwaited<T[K]>;
 * }} DeeplyAwaitedObject
 */

/**
 * Currently copied from @agoric/internal utils.js.
 * TODO Should migrate here and then, if needed, reexported there.
 *
 * @template T
 * @typedef {T extends PromiseLike<any>
 *     ? Awaited<T>
 *     : T extends (RemotableBrand<any, any> | RemotableObject)
 *       ? T
 *       : T extends {}
 *         ? Simplify<DeeplyAwaitedObject<T>>
 *         : Awaited<T>} DeeplyAwaited
 */

/**
 * Given a Passable `val` whose pass-by-copy structure may contain leaf
 * promises, return a promise for a replacement Passable,
 * where that replacement is *deeply fulfilled*, i.e., its
 * pass-by-copy structure does not contain any promises.
 *
 * This is a deep form of `Promise.all` specialized for Passables. For each
 * encountered promise, replace it with the deeply fulfilled form of
 * its fulfillment.
 * If any of the promises reject, then the promise for the replacement
 * rejects. If any of the promises never settle, then the promise for
 * the replacement never settles.
 *
 * If the replacement would not be Passable, i.e., if `val` is not
 * Passable, or if any of the transitive promises fulfill to something
 * that is not Passable, then the returned promise rejects.
 *
 * If `val` or its parts are non-key Passables only *because* they contain
 * promises, the deeply fulfilled forms of val or its parts may be keys. This
 * is for the higher "@endo/patterns" level of abstraction to determine,
 * because it defines the `Key` notion in question.
 *
 * @template {Passable} [T=Passable]
 * @param {T} val
 * @returns {Promise<DeeplyAwaited<T>>}
 */
       const deeplyFulfilled = async val => {
  // TODO Figure out why we need these at-expect-error directives below
  // and fix if possible.
  // https://github.com/endojs/endo/issues/1257 may be relevant.

  // If `val` is not Passable, `isAtom` will return false rather than
  // throwing.
  if (isAtom(val)) {
    return /** @type {DeeplyAwaited<T>} */ (val);
  }
  // if `val` is a promise but not a passable promise, for example,
  // because it is not hardened, `isPromise` will return true, which is
  // ok here bacause we unwrap it to its settlement and dispense with the
  // promise
  if (isPromise(val)) {
    return E.when(val, nonp => deeplyFulfilled(nonp));
  }
  // If `val` is any other non-Passable, the `passStyleOf(val)` will throw.
  // So this exemption for non-Passable promises is only for the top-level.
  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'copyRecord': {
      const rec = /** @type {CopyRecord} */ (val);
      const names = /** @type {string[]} */ (ownKeys(rec));
      const valPs = names.map(name => deeplyFulfilled(rec[name]));
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(Promise.all(valPs), vals =>
        harden(fromEntries(vals.map((c, i) => [names[i], c]))),
      );
    }
    case 'copyArray': {
      const arr = /** @type {CopyArray} */ (val);
      const valPs = arr.map(p => deeplyFulfilled(p));
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(Promise.all(valPs), vals => harden(vals));
    }
    case 'byteArray': {
      const byteArray = /** @type {ByteArray} */ (/** @type {unknown} */ (val));
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return byteArray;
    }
    case 'tagged': {
      const tgd = /** @type {CopyTagged} */ (val);
      const tag = getTag(tgd);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(deeplyFulfilled(tgd.payload), payload =>
        makeTagged(tag, payload),
      );
    }
    case 'remotable': {
      const rem = /** @type {RemotableObject} */ (val);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return rem;
    }
    case 'error': {
      const err = /** @type {Error} */ (val);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return err;
    }
    case 'promise': {
      const prom = /** @type {Promise} */ (/** @type {unknown} */ (val));
      return E.when(prom, nonp => deeplyFulfilled(nonp));
    }
    default: {
      throw assert.fail(X`Unexpected passStyle ${q(passStyle)}`, TypeError);
    }
  }
};$h͏_once.deeplyFulfilled(deeplyFulfilled);
harden(deeplyFulfilled);
})()
,
// === 36. pass-style ./src/types.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 37. pass-style ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/iter-helpers.js", []],["./src/passStyle-helpers.js", []],["./src/error.js", []],["./src/remotable.js", []],["./src/symbol.js", []],["./src/string.js", []],["./src/passStyleOf.js", []],["./src/makeTagged.js", []],["./src/make-far.js", []],["./src/typeGuards.js", []],["./src/deeplyFulfilled.js", []],["./src/types.js", []]]);
})()
,
// === 38. marshal ./src/encodeToCapData.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,passStyleOf,isErrorLike,makeTagged,isPrimitive,getTag,assertPassableSymbol,nameForPassableSymbol,passableSymbolForName,X,Fail,q;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/pass-style", [["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["isErrorLike",[$h͏_a => (isErrorLike = $h͏_a)]],["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["isPrimitive",[$h͏_a => (isPrimitive = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]],["assertPassableSymbol",[$h͏_a => (assertPassableSymbol = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]],["passableSymbolForName",[$h͏_a => (passableSymbolForName = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]]]]]);


















/** @import {Passable, RemotableObject} from '@endo/pass-style' */
/** @import {Encoding, EncodingUnion} from './types.js' */

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getOwnPropertyDescriptors,
  defineProperties,
  is,
  entries,
  fromEntries,
  freeze,
  hasOwn,
} = Object;

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS = '@qclass';$h͏_once.QCLASS(QCLASS);


/**
 * @param {Encoding & object} encoded
 * @returns {encoded is EncodingUnion}
 */
const hasQClass = encoded => hasOwn(encoded, QCLASS);

/**
 * @param {Encoding} encoded
 * @param {string} qclass
 * @returns {boolean}
 */
const qclassMatches = (encoded, qclass) =>
  !isPrimitive(encoded) &&
  !isArray(encoded) &&
  hasQClass(encoded) &&
  encoded[QCLASS] === qclass;

/**
 * @typedef {object} EncodeToCapDataOptions
 * @property {(
 *   remotable: RemotableObject,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeRemotableToCapData]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodePromiseToCapData]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeErrorToCapData]
 */

const dontEncodeRemotableToCapData = rem => Fail`remotable unexpected: ${rem}`;

const dontEncodePromiseToCapData = prom => Fail`promise unexpected: ${prom}`;

const dontEncodeErrorToCapData = err => Fail`error object unexpected: ${err}`;

/**
 * @param {EncodeToCapDataOptions} [encodeOptions]
 * @returns {(passable: Passable) => Encoding}
 */
       const makeEncodeToCapData = (encodeOptions = {}) => {
  const {
    encodeRemotableToCapData = dontEncodeRemotableToCapData,
    encodePromiseToCapData = dontEncodePromiseToCapData,
    encodeErrorToCapData = dontEncodeErrorToCapData,
  } = encodeOptions;

  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`. For most
   * encodings, the order of properties of each node of the output
   * structure is determined by the algorithm below without special
   * arrangement, usually by being expressed directly as an object literal.
   * The exception is copyRecords, whose natural enumeration order
   * can differ between copyRecords that our distributed object semantics
   * considers to be equivalent.
   * Since, for each copyRecord, we only accept string property names,
   * not symbols, we can canonically sort the names first.
   * JSON.stringify will then visit these in that sorted order.
   *
   * Encoding with a canonical-JSON encoder would also solve this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicately depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {any} passable
   * @returns {Encoding} except that `encodeToCapData` does not generally
   * `harden` this result before returning. Rather, `encodeToCapData` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToCapDataRecur = passable => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded as [QCLASS] composites.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null':
      case 'boolean':
      case 'string': {
        // pass through to JSON
        return passable;
      }
      case 'undefined': {
        return { [QCLASS]: 'undefined' };
      }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if (Number.isNaN(passable)) {
          return { [QCLASS]: 'NaN' };
        } else if (passable === Infinity) {
          return { [QCLASS]: 'Infinity' };
        } else if (passable === -Infinity) {
          return { [QCLASS]: '-Infinity' };
        }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0) ? 0 : passable;
      }
      case 'bigint': {
        return {
          [QCLASS]: 'bigint',
          digits: String(passable),
        };
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return {
          [QCLASS]: 'symbol',
          name,
        };
      }
      case 'copyRecord': {
        if (hasOwn(passable, QCLASS)) {
          // Hilbert hotel
          const { [QCLASS]: qclassValue, ...rest } = passable;
          /** @type {Encoding} */
          const result = {
            [QCLASS]: 'hilbert',
            original: encodeToCapDataRecur(qclassValue),
          };
          if (ownKeys(rest).length >= 1) {
            // We harden the entire capData encoding before we return it.
            // `encodeToCapData` requires that its input be Passable, and
            // therefore hardened.
            // The `freeze` here is needed anyway, because the `rest` is
            // freshly constructed by the `...` above, and we're using it
            // as imput in another call to `encodeToCapData`.
            result.rest = encodeToCapDataRecur(freeze(rest));
          }
          return result;
        }
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [name, encodeToCapDataRecur(passable[name])]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToCapDataRecur);
      }
      case 'byteArray': {
        // TODO implement
        throw Fail`marsal of byteArray not yet implemented: ${passable}`;
      }
      case 'tagged': {
        return {
          [QCLASS]: 'tagged',
          tag: getTag(passable),
          payload: encodeToCapDataRecur(passable.payload),
        };
      }
      case 'remotable': {
        const encoded = encodeRemotableToCapData(
          passable,
          encodeToCapDataRecur,
        );
        if (qclassMatches(encoded, 'slot')) {
          return encoded;
        }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail`internal: Remotable encoding must be an object with ${q(
          QCLASS,
        )} ${q('slot')}: ${encoded}`;
      }
      case 'promise': {
        const encoded = encodePromiseToCapData(passable, encodeToCapDataRecur);
        if (qclassMatches(encoded, 'slot')) {
          return encoded;
        }
        throw Fail`internal: Promise encoding must be an object with ${q(
          QCLASS,
          'slot',
        )}: ${encoded}`;
      }
      case 'error': {
        const encoded = encodeErrorToCapData(passable, encodeToCapDataRecur);
        if (qclassMatches(encoded, 'error')) {
          return encoded;
        }
        throw Fail`internal: Error encoding must be an object with ${q(
          QCLASS,
          'error',
        )}: ${encoded}`;
      }
      default: {
        throw assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  const encodeToCapData = passable => {
    if (isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      return harden(encodeErrorToCapData(passable, encodeToCapDataRecur));
    }
    return harden(encodeToCapDataRecur(passable));
  };
  return harden(encodeToCapData);
};$h͏_once.makeEncodeToCapData(makeEncodeToCapData);
harden(makeEncodeToCapData);

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|RemotableObject)} [decodeRemotableFromCapData]
 * @property {(
 *   encodedPromise: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|RemotableObject)} [decodePromiseFromCapData]
 * @property {(
 *   encodedError: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => Error} [decodeErrorFromCapData]
 */

const dontDecodeRemotableOrPromiseFromCapData = slotEncoding =>
  Fail`remotable or promise unexpected: ${slotEncoding}`;
const dontDecodeErrorFromCapData = errorEncoding =>
  Fail`error unexpected: ${errorEncoding}`;

/**
 * The current encoding does not give the decoder enough into to distinguish
 * whether a slot represents a promise or a remotable. As an implementation
 * restriction until this is fixed, if either is provided, both must be
 * provided and they must be the same.
 *
 * This seems like the best starting point to incrementally evolve to an
 * API where these can reliably differ.
 * See https://github.com/Agoric/agoric-sdk/issues/4334
 *
 * @param {DecodeOptions} [decodeOptions]
 * @returns {(encoded: Encoding) => Passable}
 */
       const makeDecodeFromCapData = (decodeOptions = {}) => {
  const {
    decodeRemotableFromCapData = dontDecodeRemotableOrPromiseFromCapData,
    decodePromiseFromCapData = dontDecodeRemotableOrPromiseFromCapData,
    decodeErrorFromCapData = dontDecodeErrorFromCapData,
  } = decodeOptions;

  decodeRemotableFromCapData === decodePromiseFromCapData ||
    Fail`An implementation restriction for now: If either decodeRemotableFromCapData or decodePromiseFromCapData is provided, both must be provided and they must be the same: ${q(
      decodeRemotableFromCapData,
    )} vs ${q(decodePromiseFromCapData)}`;

  /**
   * `decodeFromCapData` may rely on `jsonEncoded` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `jsonEncoded`
   * having been produced by JSON.stringify on the output of `encodeToCapData`
   * above, i.e., `decodeFromCapData` cannot rely on `jsonEncoded` being a
   * valid marshalled representation. Rather, `decodeFromCapData` must
   * validate that.
   *
   * @param {Encoding} jsonEncoded must be hardened
   */
  const decodeFromCapData = jsonEncoded => {
    if (isPrimitive(jsonEncoded)) {
      // primitives pass through
      return jsonEncoded;
    }
    if (isArray(jsonEncoded)) {
      return jsonEncoded.map(encodedVal => decodeFromCapData(encodedVal));
    } else if (hasQClass(jsonEncoded)) {
      const qclass = jsonEncoded[QCLASS];
      typeof qclass === 'string' ||
        Fail`invalid ${q(QCLASS)} typeof ${q(typeof qclass)}`;
      switch (qclass) {
        // Encoding of primitives not handled by JSON
        case 'undefined': {
          return undefined;
        }
        case 'NaN': {
          return NaN;
        }
        case 'Infinity': {
          return Infinity;
        }
        case '-Infinity': {
          return -Infinity;
        }
        case 'bigint': {
          const { digits } = jsonEncoded;
          typeof digits === 'string' ||
            Fail`invalid digits typeof ${q(typeof digits)}`;
          return BigInt(digits);
        }
        case '@@asyncIterator': {
          // Deprecated qclass. TODO make conditional
          // on environment variable. Eventually remove, but after confident
          // that there are no more supported senders.
          //
          return Symbol.asyncIterator;
        }
        case 'symbol': {
          const { name } = jsonEncoded;
          return passableSymbolForName(name);
        }
        case 'tagged': {
          const { tag, payload } = jsonEncoded;
          return makeTagged(tag, decodeFromCapData(payload));
        }
        case 'slot': {
          // See note above about how the current encoding cannot reliably
          // distinguish which we should call, so in the non-default case
          // both must be the same and it doesn't matter which we call.
          const decoded = decodeRemotableFromCapData(
            jsonEncoded,
            decodeFromCapData,
          );
          // BEWARE: capdata does not check that `decoded` is
          // a promise or a remotable, since that would break some
          // capdata clients. We are deprecating capdata, and these clients
          // will need to update before switching to smallcaps.
          return decoded;
        }
        case 'error': {
          const decoded = decodeErrorFromCapData(
            jsonEncoded,
            decodeFromCapData,
          );
          if (passStyleOf(decoded) === 'error') {
            return decoded;
          }
          throw Fail`internal: decodeErrorFromCapData option must return an error: ${decoded}`;
        }
        case 'hilbert': {
          const { original, rest } = jsonEncoded;
          hasOwn(jsonEncoded, 'original') ||
            Fail`Invalid Hilbert Hotel encoding ${jsonEncoded}`;
          // Don't harden since we're not done mutating it
          const result = { [QCLASS]: decodeFromCapData(original) };
          if (hasOwn(jsonEncoded, 'rest')) {
            const isNonEmptyObject =
              typeof rest === 'object' &&
              rest !== null &&
              ownKeys(rest).length >= 1;
            if (!isNonEmptyObject) {
              throw Fail`Rest encoding must be a non-empty object: ${rest}`;
            }
            const restObj = decodeFromCapData(rest);
            // TODO really should assert that `passStyleOf(rest)` is
            // `'copyRecord'` but we'd have to harden it and it is too
            // early to do that.
            !hasOwn(restObj, QCLASS) ||
              Fail`Rest must not contain its own definition of ${q(QCLASS)}`;
            defineProperties(result, getOwnPropertyDescriptors(restObj));
          }
          return result;
        }
        // @ts-expect-error This is the error case we're testing for
        case 'ibid': {
          throw Fail`The capData protocol no longer supports ${q(QCLASS)} ${q(
            qclass,
          )}`;
        }
        default: {
          throw assert.fail(
            X`unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError,
          );
        }
      }
    } else {
      assert(typeof jsonEncoded === 'object' && jsonEncoded !== null);
      const decodeEntry = ([name, encodedVal]) => {
        typeof name === 'string' ||
          Fail`Property ${q(name)} of ${jsonEncoded} must be a string`;
        return [name, decodeFromCapData(encodedVal)];
      };
      const decodedEntries = entries(jsonEncoded).map(decodeEntry);
      return fromEntries(decodedEntries);
    }
  };
  return harden(decodeFromCapData);
};$h͏_once.makeDecodeFromCapData(makeDecodeFromCapData);
})()
,
// === 39. common ./object-map.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);

/**
 * @typedef {<O extends Record<string, unknown>>(
 *   obj: O,
 * ) => { [K in keyof O]: K extends string ? [K, O[K]] : never }[keyof O][]} TypedEntries
 */
       const typedEntries = /** @type {TypedEntries} */ (Object.entries);

/**
 * @typedef {<
 *   const Entries extends ReadonlyArray<readonly [PropertyKey, unknown]>,
 * >(
 *   entries: Entries,
 * ) => { [Entry in Entries[number] as Entry[0]]: Entry[1] }} FromTypedEntries
 */$h͏_once.typedEntries(typedEntries);
       const fromTypedEntries = /** @type {FromTypedEntries} */ (
  Object.fromEntries
);

/**
 * @typedef {<A extends unknown[], V>(
 *   arr: A,
 *   mapper: <K extends number>(el: A[K], idx: K, arr: A) => V,
 * ) => V[]} TypedMap
 */$h͏_once.fromTypedEntries(fromTypedEntries);
       const typedMap = /** @type {TypedMap} */ (
  Function.prototype.call.bind(Array.prototype.map)
);

/**
 * By analogy with how `Array.prototype.map` will map the elements of
 * an array to transformed elements of an array of the same shape,
 * `objectMap` will do likewise for the string-named own enumerable
 * properties of an object.
 *
 * Typical usage applies `objectMap` to a CopyRecord, i.e.,
 * an object for which `passStyleOf(original) === 'copyRecord'`. For these,
 * none of the following edge cases arise. The result will be a CopyRecord
 * with exactly the same property names, whose values are the mapped form of
 * the original's values.
 *
 * When the original is not a CopyRecord, some edge cases to be aware of
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * Only the string-named enumerable own properties of the original
 *      are mapped. All other properties are ignored.
 *    * If any of the original properties were accessors, `Object.entries`
 *      will cause its `getter` to be called and will use the resulting
 *      value.
 *    * No matter whether the original property was an accessor, writable,
 *      or configurable, all the properties of the returned object will be
 *      non-writable, non-configurable, data properties.
 *    * No matter what the original object may have inherited from, and
 *      no matter whether it was a special kind of object such as an array,
 *      the returned object will always be a plain object inheriting directly
 *      from `Object.prototype` and whose state is only these new mapped
 *      own properties.
 *
 * With these differences, even if the original object was not a CopyRecord,
 * if all the mapped values are Passable, then the returned object will be
 * a CopyRecord.
 *
 * @template {Record<string, unknown>} O
 * @template R map result
 * @param {O} original
 * @param {<K extends string & keyof O>(value: O[K], key: K) => R} mapFn
 * @returns {{ [K in keyof O]: K extends string ? R : never }}
 */$h͏_once.typedMap(typedMap);
       const objectMap = (original, mapFn) => {
  const oldEntries = typedEntries(original);
  /** @type {<K extends string & keyof O>(entry: [K, O[K]]) => [K, R]} */
  const mapEntry = ([k, v]) => [k, mapFn(v, k)];
  const newEntries = typedMap(oldEntries, mapEntry);
  const newObj = fromTypedEntries(newEntries);
  return /** @type {any} */ (harden(newObj));
};$h͏_once.objectMap(objectMap);
harden(objectMap);
})()
,
// === 40. marshal ./src/encodeToSmallcaps.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,X,Fail,q,ZERO_N,passStyleOf,isErrorLike,makeTagged,getTag,assertPassableSymbol,nameForPassableSymbol,passableSymbolForName;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]]]],["@endo/nat", [["ZERO_N",[$h͏_a => (ZERO_N = $h͏_a)]]]],["@endo/pass-style", [["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["isErrorLike",[$h͏_a => (isErrorLike = $h͏_a)]],["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]],["assertPassableSymbol",[$h͏_a => (assertPassableSymbol = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]],["passableSymbolForName",[$h͏_a => (passableSymbolForName = $h͏_a)]]]]]);




















/** @import {Passable, RemotableObject} from '@endo/pass-style' */
// FIXME define actual types
/** @typedef {any} SmallcapsEncoding */
/** @typedef {any} SmallcapsEncodingUnion */

const { ownKeys } = Reflect;
const { isArray } = Array;
const { is, entries, fromEntries, hasOwn } = Object;

const BANG = '!'.charCodeAt(0);
const DASH = '-'.charCodeAt(0);

/**
 * An `encodeToSmallcaps` function takes a passable and returns a
 * JSON-representable object (i.e., round-tripping it through
 * `JSON.stringify` and `JSON.parse` with no replacers or revivers
 * returns an equivalent structure except for object identity).
 * We call this representation a Smallcaps Encoding.
 *
 * A `decodeFromSmallcaps` function takes as argument what it
 * *assumes* is the result of a plain `JSON.parse` with no resolver. It then
 * must validate that it is a valid Smallcaps Encoding, and if it is,
 * return a corresponding passable.
 *
 * Smallcaps considers the characters between `!` (ascii code 33, BANG)
 * and `-` (ascii code 45, DASH) to be special prefixes allowing
 * representation of JSON-incompatible data using strings.
 * These characters, in order, are `!"#$%&'()*+,-`
 * Of these, smallcaps currently uses the following:
 *
 *  * `!` - escaped string
 *  * `+` - non-negative bigint
 *  * `-` - negative bigint
 *  * `#` - manifest constant
 *  * `%` - symbol
 *  * `$` - remotable
 *  * `&` - promise
 *
 * All other special characters (`"'()*,`) are reserved for future use.
 *
 * The manifest constants that smallcaps currently uses for values:
 *  * `#undefined`
 *  * `#NaN`
 *  * `#Infinity`
 *  * `#-Infinity`
 *
 * and for property names analogous to capdata @qclass:
 *  * `#tag`
 *  * `#error`
 *
 * All other encoded strings beginning with `#` are reserved for
 * future use.
 *
 * @param {string} encodedStr
 * @returns {boolean}
 */
const startsSpecial = encodedStr => {
  if (encodedStr === '') {
    return false;
  }
  // charCodeAt(0) and number compare is a bit faster.
  const code = encodedStr.charCodeAt(0);
  // eslint-disable-next-line yoda
  return BANG <= code && code <= DASH;
};

/**
 * @typedef {object} EncodeToSmallcapsOptions
 * @property {(
 *   remotable: RemotableObject,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeRemotableToSmallcaps]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodePromiseToSmallcaps]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeErrorToSmallcaps]
 */

const dontEncodeRemotableToSmallcaps = rem =>
  Fail`remotable unexpected: ${rem}`;

const dontEncodePromiseToSmallcaps = prom => Fail`promise unexpected: ${prom}`;

const dontEncodeErrorToSmallcaps = err =>
  Fail`error object unexpected: ${q(err)}`;

/**
 * @param {EncodeToSmallcapsOptions} [encodeOptions]
 * encodeOptions is actually optional, but not marked as such to work around
 * https://github.com/microsoft/TypeScript/issues/50286
 *
 * @returns {(passable: Passable) => SmallcapsEncoding}
 */
       const makeEncodeToSmallcaps = (encodeOptions = {}) => {
  const {
    encodeRemotableToSmallcaps = dontEncodeRemotableToSmallcaps,
    encodePromiseToSmallcaps = dontEncodePromiseToSmallcaps,
    encodeErrorToSmallcaps = dontEncodeErrorToSmallcaps,
  } = encodeOptions;

  const assertEncodedError = encoding => {
    (typeof encoding === 'object' && hasOwn(encoding, '#error')) ||
      Fail`internal: Error encoding must have "#error" property: ${q(
        encoding,
      )}`;
    // Assert that the #error property decodes to a string.
    const message = encoding['#error'];
    (typeof message === 'string' &&
      (!startsSpecial(message) || message.charAt(0) === '!')) ||
      Fail`internal: Error encoding must have string message: ${q(message)}`;
  };

  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`. For most
   * encodings, the order of properties of each node of the output
   * structure is determined by the algorithm below without special
   * arrangement, usually by being expressed directly as an object literal.
   * The exception is copyRecords, whose natural enumeration order
   * can differ between copyRecords that our distributed object semantics
   * considers to be equivalent.
   * Since, for each copyRecord, we only accept string property names,
   * not symbols, we can canonically sort the names first.
   * JSON.stringify will then visit these in that sorted order.
   *
   * Encoding with a canonical-JSON encoder would also solve this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicately depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {any} passable
   * @returns {SmallcapsEncoding} except that `encodeToSmallcaps` does not generally
   * `harden` this result before returning. Rather, `encodeToSmallcaps` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToSmallcapsRecur = passable => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded into smallcaps strings.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null':
      case 'boolean': {
        // pass through to JSON
        return passable;
      }
      case 'string': {
        if (startsSpecial(passable)) {
          // Strings that start with a special char are quoted with `!`.
          // Since `!` is itself a special character, this trivially does
          // the Hilbert hotel. Also, since the special characters are
          // a continuous subrange of ascii, this quoting is sort-order
          // preserving.
          return `!${passable}`;
        }
        // All other strings pass through to JSON
        return passable;
      }
      case 'undefined': {
        return '#undefined';
      }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if (Number.isNaN(passable)) {
          return '#NaN';
        } else if (passable === Infinity) {
          return '#Infinity';
        } else if (passable === -Infinity) {
          return '#-Infinity';
        }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0) ? 0 : passable;
      }
      case 'bigint': {
        const str = String(passable);
        return /** @type {bigint} */ (passable) < ZERO_N ? str : `+${str}`;
      }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name = /** @type {string} */ (nameForPassableSymbol(passable));
        return `%${name}`;
      }
      case 'copyRecord': {
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return fromEntries(
          names.map(name => [
            encodeToSmallcapsRecur(name),
            encodeToSmallcapsRecur(passable[name]),
          ]),
        );
      }
      case 'copyArray': {
        return passable.map(encodeToSmallcapsRecur);
      }
      case 'byteArray': {
        // TODO implement
        throw Fail`marsal of byteArray not yet implemented: ${passable}`;
      }
      case 'tagged': {
        return {
          '#tag': encodeToSmallcapsRecur(getTag(passable)),
          payload: encodeToSmallcapsRecur(passable.payload),
        };
      }
      case 'remotable': {
        const result = encodeRemotableToSmallcaps(
          passable,
          encodeToSmallcapsRecur,
        );
        if (typeof result === 'string' && result.charAt(0) === '$') {
          return result;
        }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail`internal: Remotable encoding must start with "$": ${result}`;
      }
      case 'promise': {
        const result = encodePromiseToSmallcaps(
          passable,
          encodeToSmallcapsRecur,
        );
        if (typeof result === 'string' && result.charAt(0) === '&') {
          return result;
        }
        throw Fail`internal: Promise encoding must start with "&": ${result}`;
      }
      case 'error': {
        const result = encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur);
        assertEncodedError(result);
        return result;
      }
      default: {
        throw assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  const encodeToSmallcaps = passable => {
    if (isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      const result = harden(
        encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur),
      );
      assertEncodedError(result);
      return result;
    }
    return harden(encodeToSmallcapsRecur(passable));
  };
  return harden(encodeToSmallcaps);
};$h͏_once.makeEncodeToSmallcaps(makeEncodeToSmallcaps);
harden(makeEncodeToSmallcaps);

/**
 * @typedef {object} DecodeFromSmallcapsOptions
 * @property {(
 *   encodedRemotable: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => RemotableObject} [decodeRemotableFromSmallcaps]
 * @property {(
 *   encodedPromise: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Promise} [decodePromiseFromSmallcaps]
 * @property {(
 *   encodedError: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Error} [decodeErrorFromSmallcaps]
 */

const dontDecodeRemotableFromSmallcaps = encoding =>
  Fail`remotable unexpected: ${encoding}`;
const dontDecodePromiseFromSmallcaps = encoding =>
  Fail`promise unexpected: ${encoding}`;
const dontDecodeErrorFromSmallcaps = encoding =>
  Fail`error unexpected: ${q(encoding)}`;

/**
 * @param {DecodeFromSmallcapsOptions} [decodeOptions]
 * @returns {(encoded: SmallcapsEncoding) => Passable}
 */
       const makeDecodeFromSmallcaps = (decodeOptions = {}) => {
  const {
    decodeRemotableFromSmallcaps = dontDecodeRemotableFromSmallcaps,
    decodePromiseFromSmallcaps = dontDecodePromiseFromSmallcaps,
    decodeErrorFromSmallcaps = dontDecodeErrorFromSmallcaps,
  } = decodeOptions;

  /**
   * `decodeFromSmallcaps` may rely on `encoding` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `encoding`
   * having been produced by JSON.stringify on the output of `encodeToSmallcaps`
   * above, i.e., `decodeFromSmallcaps` cannot rely on `encoding` being a
   * valid marshalled representation. Rather, `decodeFromSmallcaps` must
   * validate that.
   *
   * @param {SmallcapsEncoding} encoding must be hardened
   */
  const decodeFromSmallcaps = encoding => {
    switch (typeof encoding) {
      case 'boolean':
      case 'number': {
        return encoding;
      }
      case 'string': {
        if (!startsSpecial(encoding)) {
          return encoding;
        }
        const c = encoding.charAt(0);
        switch (c) {
          case '!': {
            // un-hilbert-ify the string
            return encoding.slice(1);
          }
          case '%': {
            return passableSymbolForName(encoding.slice(1));
          }
          case '#': {
            switch (encoding) {
              case '#undefined': {
                return undefined;
              }
              case '#NaN': {
                return NaN;
              }
              case '#Infinity': {
                return Infinity;
              }
              case '#-Infinity': {
                return -Infinity;
              }
              default: {
                throw assert.fail(
                  X`unknown constant "${q(encoding)}"`,
                  TypeError,
                );
              }
            }
          }
          case '+':
          case '-': {
            return BigInt(encoding);
          }
          case '$': {
            const result = decodeRemotableFromSmallcaps(
              encoding,
              decodeFromSmallcaps,
            );
            // @ts-ignore XXX SmallCapsEncoding
            if (passStyleOf(result) !== 'remotable') {
              Fail`internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`;
            }
            return result;
          }
          case '&': {
            const result = decodePromiseFromSmallcaps(
              encoding,
              decodeFromSmallcaps,
            );
            if (passStyleOf(result) !== 'promise') {
              Fail`internal: decodePromiseFromSmallcaps option must return a promise: ${result}`;
            }
            return result;
          }
          default: {
            throw Fail`Special char ${q(
              c,
            )} reserved for future use: ${encoding}`;
          }
        }
      }
      case 'object': {
        if (encoding === null) {
          return encoding;
        }

        if (isArray(encoding)) {
          return encoding.map(val => decodeFromSmallcaps(val));
        }

        if (hasOwn(encoding, '#tag')) {
          const { '#tag': tag, payload, ...rest } = encoding;
          typeof tag === 'string' ||
            Fail`Value of "#tag", the tag, must be a string: ${encoding}`;
          ownKeys(rest).length === 0 ||
            Fail`#tag record unexpected properties: ${q(ownKeys(rest))}`;
          return makeTagged(
            decodeFromSmallcaps(tag),
            decodeFromSmallcaps(payload),
          );
        }

        if (hasOwn(encoding, '#error')) {
          const result = decodeErrorFromSmallcaps(
            encoding,
            decodeFromSmallcaps,
          );
          passStyleOf(result) === 'error' ||
            Fail`internal: decodeErrorFromSmallcaps option must return an error: ${result}`;
          return result;
        }

        const decodeEntry = ([encodedName, encodedVal]) => {
          typeof encodedName === 'string' ||
            Fail`Property name ${q(
              encodedName,
            )} of ${encoding} must be a string`;
          encodedName.charAt(0) !== '#' ||
            Fail`Unrecognized record type ${q(encodedName)}: ${encoding}`;
          const name = decodeFromSmallcaps(encodedName);
          typeof name === 'string' ||
            Fail`Decoded property name ${name} from ${encoding} must be a string`;
          return [name, decodeFromSmallcaps(encodedVal)];
        };
        const decodedEntries = entries(encoding).map(decodeEntry);
        return fromEntries(decodedEntries);
      }
      default: {
        throw assert.fail(
          X`internal: unrecognized JSON typeof ${q(
            typeof encoding,
          )}: ${encoding}`,
          TypeError,
        );
      }
    }
  };
  return harden(decodeFromSmallcaps);
};$h͏_once.makeDecodeFromSmallcaps(makeDecodeFromSmallcaps);
})()
,
// === 41. marshal ./src/marshal.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Nat,assertPassable,getInterfaceOf,getErrorConstructor,toPassableError,X,Fail,q,makeError,annotateError,objectMap,QCLASS,makeEncodeToCapData,makeDecodeFromCapData,makeDecodeFromSmallcaps,makeEncodeToSmallcaps;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/nat", [["Nat",[$h͏_a => (Nat = $h͏_a)]]]],["@endo/pass-style", [["assertPassable",[$h͏_a => (assertPassable = $h͏_a)]],["getInterfaceOf",[$h͏_a => (getInterfaceOf = $h͏_a)]],["getErrorConstructor",[$h͏_a => (getErrorConstructor = $h͏_a)]],["toPassableError",[$h͏_a => (toPassableError = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["makeError",[$h͏_a => (makeError = $h͏_a)]],["annotateError",[$h͏_a => (annotateError = $h͏_a)]]]],["@endo/common/object-map.js", [["objectMap",[$h͏_a => (objectMap = $h͏_a)]]]],["./encodeToCapData.js", [["QCLASS",[$h͏_a => (QCLASS = $h͏_a)]],["makeEncodeToCapData",[$h͏_a => (makeEncodeToCapData = $h͏_a)]],["makeDecodeFromCapData",[$h͏_a => (makeDecodeFromCapData = $h͏_a)]]]],["./encodeToSmallcaps.js", [["makeDecodeFromSmallcaps",[$h͏_a => (makeDecodeFromSmallcaps = $h͏_a)]],["makeEncodeToSmallcaps",[$h͏_a => (makeEncodeToSmallcaps = $h͏_a)]]]]]);




















/**
 * @import {ConvertSlotToVal, ConvertValToSlot, FromCapData, MakeMarshalOptions, ToCapData} from './types.js';
 * @import {Passable, PassableCap, RemotableObject} from '@endo/pass-style';
 * @import {InterfaceSpec} from '@endo/pass-style';
 * @import {Encoding} from './types.js';
 */

const { defineProperties, hasOwn } = Object;
const { isArray } = Array;
const { ownKeys } = Reflect;

/** @type {ConvertValToSlot<any>} */
const defaultValToSlotFn = x => x;
/** @type {ConvertSlotToVal<any>} */
const defaultSlotToValFn = (x, _) => x;

/**
 * @template Slot
 * @param {ConvertValToSlot<Slot>} [convertValToSlot]
 * @param {ConvertSlotToVal<Slot>} [convertSlotToVal]
 * @param {MakeMarshalOptions} options
 */
       const makeMarshal = (
  convertValToSlot = defaultValToSlotFn,
  convertSlotToVal = defaultSlotToValFn,
  {
    errorTagging = 'on',
    marshalName = 'anon-marshal',
    // TODO Temporary hack.
    // See https://github.com/Agoric/agoric-sdk/issues/2780
    errorIdNum = 10000,
    // We prefer that the caller instead log to somewhere hidden
    // to be revealed when correlating with the received error.
    marshalSaveError = err =>
      console.log('Temporary logging of sent error', err),
    // Default to 'capdata' because it was implemented first.
    // Sometimes, ontogeny does recapitulate phylogeny ;)
    serializeBodyFormat = 'capdata',
  } = {},
) => {
  assert.typeof(marshalName, 'string');
  errorTagging === 'on' ||
    errorTagging === 'off' ||
    Fail`The errorTagging option can only be "on" or "off" ${errorTagging}`;
  const nextErrorId = () => {
    errorIdNum += 1;
    return `error:${marshalName}#${errorIdNum}`;
  };

  /**
   * @type {ToCapData<Slot>}
   */
  const toCapData = root => {
    const slots = [];
    // maps val (promise or remotable) to index of slots[]
    const slotMap = new Map();

    /**
     * @param {PassableCap} passable
     * @returns {{index: number, repeat: boolean}}
     */
    const encodeSlotCommon = passable => {
      let index = slotMap.get(passable);
      if (index !== undefined) {
        // TODO assert that it's the same iface as before
        assert.typeof(index, 'number');
        return harden({ index, repeat: true });
      }

      index = slots.length;
      const slot = convertValToSlot(passable);
      slots.push(slot);
      slotMap.set(passable, index);
      return harden({ index, repeat: false });
    };

    /**
     * Even if an Error is not actually passable, we'd rather send
     * it anyway because the diagnostic info carried by the error
     * is more valuable than diagnosing why the error isn't
     * passable. See comments in isErrorLike.
     *
     * @param {Error} err
     * @param {(p: Passable) => unknown} encodeRecur
     * @returns {{errorId?: string, message: string, name: string}}
     */
    const encodeErrorCommon = (err, encodeRecur) => {
      const message = encodeRecur(`${err.message}`);
      assert.typeof(message, 'string');
      const name = encodeRecur(`${err.name}`);
      assert.typeof(name, 'string');
      // TODO Must encode `cause`, `errors`, but
      // only once all possible counterparty decoders are tolerant of
      // receiving them.
      if (errorTagging === 'on') {
        // We deliberately do not share the stack, but it would
        // be useful to log the stack locally so someone who has
        // privileged access to the throwing Vat can correlate
        // the problem with the remote Vat that gets this
        // summary. If we do that, we could allocate some random
        // identifier and include it in the message, to help
        // with the correlation.
        const errorId = encodeRecur(nextErrorId());
        assert.typeof(errorId, 'string');
        annotateError(err, X`Sent as ${errorId}`);
        marshalSaveError(err);
        return harden({ errorId, message, name });
      } else {
        return harden({ message, name });
      }
    };

    if (serializeBodyFormat === 'capdata') {
      /**
       * @param {PassableCap} passable
       * @param {InterfaceSpec} [iface]
       * @returns {Encoding}
       */
      const encodeSlotToCapData = (passable, iface = undefined) => {
        const { index, repeat } = encodeSlotCommon(passable);

        if (repeat === true || iface === undefined) {
          return harden({ [QCLASS]: 'slot', index });
        } else {
          return harden({ [QCLASS]: 'slot', iface, index });
        }
      };

      /** @type {(promise: RemotableObject, encodeRecur: (p: Passable) => Encoding) => Encoding} */
      const encodeRemotableToCapData = (val, _encodeRecur) =>
        encodeSlotToCapData(val, getInterfaceOf(val));

      /** @type {(promise: Promise, encodeRecur: (p: Passable) => Encoding) => Encoding} */
      const encodePromiseToCapData = (promise, _encodeRecur) =>
        encodeSlotToCapData(promise);

      /**
       * Even if an Error is not actually passable, we'd rather send
       * it anyway because the diagnostic info carried by the error
       * is more valuable than diagnosing why the error isn't
       * passable. See comments in isErrorLike.
       *
       * @param {Error} err
       * @param {(p: Passable) => Encoding} encodeRecur
       * @returns {Encoding}
       */
      const encodeErrorToCapData = (err, encodeRecur) => {
        const errData = encodeErrorCommon(err, encodeRecur);
        return harden({ [QCLASS]: 'error', ...errData });
      };

      const encodeToCapData = makeEncodeToCapData({
        encodeRemotableToCapData,
        encodePromiseToCapData,
        encodeErrorToCapData,
      });

      const encoded = encodeToCapData(root);
      const body = JSON.stringify(encoded);
      return harden({
        body,
        slots,
      });
    } else if (serializeBodyFormat === 'smallcaps') {
      /**
       * @param {string} prefix
       * @param {PassableCap} passable
       * @param {InterfaceSpec} [iface]
       * @returns {string}
       */
      const encodeSlotToSmallcaps = (prefix, passable, iface = undefined) => {
        const { index, repeat } = encodeSlotCommon(passable);

        // TODO explore removing this special case
        if (repeat === true || iface === undefined) {
          return `${prefix}${index}`;
        }
        return `${prefix}${index}.${iface}`;
      };

      const encodeRemotableToSmallcaps = (remotable, _encodeRecur) =>
        encodeSlotToSmallcaps('$', remotable, getInterfaceOf(remotable));

      const encodePromiseToSmallcaps = (promise, _encodeRecur) =>
        encodeSlotToSmallcaps('&', promise);

      const encodeErrorToSmallcaps = (err, encodeRecur) => {
        const errData = encodeErrorCommon(err, encodeRecur);
        const { message, ...rest } = errData;
        return harden({ '#error': message, ...rest });
      };

      const encodeToSmallcaps = makeEncodeToSmallcaps({
        encodeRemotableToSmallcaps,
        encodePromiseToSmallcaps,
        encodeErrorToSmallcaps,
      });

      const encoded = encodeToSmallcaps(root);
      const smallcapsBody = JSON.stringify(encoded);
      return harden({
        // Valid JSON cannot begin with a '#', so this is a valid signal
        // indicating smallcaps format.
        body: `#${smallcapsBody}`,
        slots,
      });
    } else {
      // The `throw` is a noop since `Fail` throws. Added for confused linters.
      throw Fail`Unrecognized serializeBodyFormat: ${q(serializeBodyFormat)}`;
    }
  };

  const makeFullRevive = slots => {
    /** @type {Map<number, RemotableObject | Promise>} */
    const valMap = new Map();

    /**
     * @param {{iface?: string, index: number}} slotData
     * @returns {RemotableObject | Promise}
     */
    const decodeSlotCommon = slotData => {
      const { iface = undefined, index, ...rest } = slotData;
      ownKeys(rest).length === 0 ||
        Fail`unexpected encoded slot properties ${q(ownKeys(rest))}`;
      const extant = valMap.get(index);
      if (extant) {
        return extant;
      }
      // TODO SECURITY HAZARD: must enfoce that remotable vs promise
      // is according to the encoded string.
      const slot = slots[Number(Nat(index))];
      const val = convertSlotToVal(slot, iface);
      valMap.set(index, val);
      return val;
    };

    /**
     * @param {{
     *   errorId?: string,
     *   message: string,
     *   name: string,
     *   cause: unknown,
     *   errors: unknown,
     * }} errData
     * @param {(e: unknown) => Passable} decodeRecur
     * @returns {Error}
     */
    const decodeErrorCommon = (errData, decodeRecur) => {
      const {
        errorId = undefined,
        message,
        name,
        cause = undefined,
        errors = undefined,
        ...rest
      } = errData;
      // See https://github.com/endojs/endo/pull/2052
      // capData does not transform strings. The immediately following calls
      // to `decodeRecur` are for reuse by other encodings that do,
      // such as smallcaps.
      const dName = decodeRecur(name);
      const dMessage = decodeRecur(message);
      // errorId is a late addition so be tolerant of its absence.
      const dErrorId = /** @type {string} */ (errorId && decodeRecur(errorId));
      if (typeof dName !== 'string') {
        throw Fail`invalid error name typeof ${q(typeof dName)}`;
      }
      if (typeof dMessage !== 'string') {
        throw Fail`invalid error message typeof ${q(typeof dMessage)}`;
      }
      const errConstructor = getErrorConstructor(dName) || Error;
      const errorName =
        dErrorId === undefined
          ? `Remote${errConstructor.name}`
          : `Remote${errConstructor.name}(${dErrorId})`;
      const options = {
        errorName,
        sanitize: false,
      };
      if (cause) {
        options.cause = decodeRecur(cause);
      }
      if (errors) {
        options.errors = decodeRecur(errors);
      }
      const rawError = makeError(dMessage, errConstructor, options);
      // Note that this does not decodeRecur rest's property names.
      // This would be inconsistent with smallcaps' expected handling,
      // but is fine here since it is only used for `annotateError`,
      // which is for diagnostic info that is otherwise unobservable.
      const descs = objectMap(rest, data => ({
        value: decodeRecur(data),
        writable: false,
        enumerable: false,
        configurable: false,
      }));
      defineProperties(rawError, descs);
      harden(rawError);
      return toPassableError(rawError);
    };

    // The current encoding does not give the decoder enough into to distinguish
    // whether a slot represents a promise or a remotable. As an implementation
    // restriction until this is fixed, if either is provided, both must be
    // provided and they must be the same.
    // See https://github.com/Agoric/agoric-sdk/issues/4334
    const decodeRemotableOrPromiseFromCapData = (rawTree, _decodeRecur) => {
      const { [QCLASS]: _, ...slotData } = rawTree;
      return decodeSlotCommon(slotData);
    };

    const decodeErrorFromCapData = (rawTree, decodeRecur) => {
      const { [QCLASS]: _, ...errData } = rawTree;
      return decodeErrorCommon(errData, decodeRecur);
    };

    const reviveFromCapData = makeDecodeFromCapData({
      decodeRemotableFromCapData: decodeRemotableOrPromiseFromCapData,
      decodePromiseFromCapData: decodeRemotableOrPromiseFromCapData,
      decodeErrorFromCapData,
    });

    const makeDecodeSlotFromSmallcaps = prefix => {
      /**
       * @param {string} stringEncoding
       * @param {(e: unknown) => Passable} _decodeRecur
       * @returns {RemotableObject | Promise}
       */
      return (stringEncoding, _decodeRecur) => {
        assert(stringEncoding.charAt(0) === prefix);
        // slots: $slotIndex.iface or $slotIndex
        const i = stringEncoding.indexOf('.');
        const index = Number(stringEncoding.slice(1, i < 0 ? undefined : i));
        // i < 0 means there was no iface included.
        const iface = i < 0 ? undefined : stringEncoding.slice(i + 1);
        return decodeSlotCommon({ iface, index });
      };
    };
    const decodeRemotableFromSmallcaps = makeDecodeSlotFromSmallcaps('$');
    const decodePromiseFromSmallcaps = makeDecodeSlotFromSmallcaps('&');

    const decodeErrorFromSmallcaps = (encoding, decodeRecur) => {
      const { '#error': message, ...restErrData } = encoding;
      !hasOwn(restErrData, 'message') ||
        Fail`unexpected encoded error property ${q('message')}`;
      return decodeErrorCommon({ message, ...restErrData }, decodeRecur);
    };

    const reviveFromSmallcaps = makeDecodeFromSmallcaps({
      // @ts-ignore XXX SmallCapsEncoding
      decodeRemotableFromSmallcaps,
      // @ts-ignore XXX SmallCapsEncoding
      decodePromiseFromSmallcaps,
      decodeErrorFromSmallcaps,
    });

    return harden({ reviveFromCapData, reviveFromSmallcaps });
  };

  /**
   * @type {FromCapData<Slot>}
   */
  const fromCapData = data => {
    const { body, slots } = data;
    typeof body === 'string' ||
      Fail`unserialize() given non-capdata (.body is ${body}, not string)`;
    isArray(data.slots) ||
      Fail`unserialize() given non-capdata (.slots are not Array)`;
    const { reviveFromCapData, reviveFromSmallcaps } = makeFullRevive(slots);
    let result;
    // JSON cannot begin with a '#', so this is an unambiguous signal.
    if (body.charAt(0) === '#') {
      const smallcapsBody = body.slice(1);
      const encoding = harden(JSON.parse(smallcapsBody));
      result = harden(reviveFromSmallcaps(encoding));
    } else {
      const rawTree = harden(JSON.parse(body));
      result = harden(reviveFromCapData(rawTree));
    }
    // See https://github.com/Agoric/agoric-sdk/issues/4337
    // which should be considered fixed once we've completed the switch
    // to smallcaps.
    assertPassable(result);
    return /** @type {PassableCap} */ (result);
  };

  return harden({
    toCapData,
    fromCapData,

    // for backwards compatibility
    /** @deprecated use toCapData */
    serialize: toCapData,
    /** @deprecated use fromCapData */
    unserialize: fromCapData,
  });
};$h͏_once.makeMarshal(makeMarshal);
})()
,
// === 42. marshal ./src/marshal-stringify.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,makeMarshal;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./marshal.js", [["makeMarshal",[$h͏_a => (makeMarshal = $h͏_a)]]]]]);



/** @import {Passable} from '@endo/pass-style' */

const { freeze } = Object;

/** @type {import('./types.js').ConvertValToSlot<any>} */
const doNotConvertValToSlot = val =>
  Fail`Marshal's stringify rejects presences and promises ${val}`;

/** @type {import('./types.js').ConvertSlotToVal<any>} */
const doNotConvertSlotToVal = (slot, _iface) =>
  Fail`Marshal's parse must not encode any slots ${slot}`;

const badArrayHandler = harden({
  get: (_target, name, _receiver) => {
    if (name === 'length') {
      return 0;
    }
    // `throw` is noop since `Fail` throws. But linter confused
    throw Fail`Marshal's parse must not encode any slot positions ${name}`;
  },
});

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const arrayTarget = freeze(/** @type {any[]} */ ([]));
const badArray = new Proxy(arrayTarget, badArrayHandler);

const { serialize, unserialize } = makeMarshal(
  doNotConvertValToSlot,
  doNotConvertSlotToVal,
  {
    errorTagging: 'off',
    // TODO fix tests to works with smallcaps.
    serializeBodyFormat: 'capdata',
  },
);

/**
 * @param {Passable} val
 * @returns {string}
 */
const stringify = val => serialize(val).body;$h͏_once.stringify(stringify);
harden(stringify);

/**
 * @param {string} str
 * @returns {Passable}
 */
const parse = str =>
  unserialize(
    // `freeze` but not `harden` since the `badArray` proxy and its target
    // must remain trapping.
    // See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
    freeze({
      body: str,
      slots: badArray,
    }),
  );$h͏_once.parse(parse);
harden(parse);
})()
,
// === 43. marshal ./src/marshal-justin.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,q,X,Fail,Nat,getErrorConstructor,isPrimitive,nameForPassableSymbol,passableSymbolForName,QCLASS,makeMarshal;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["@endo/nat", [["Nat",[$h͏_a => (Nat = $h͏_a)]]]],["@endo/pass-style", [["getErrorConstructor",[$h͏_a => (getErrorConstructor = $h͏_a)]],["isPrimitive",[$h͏_a => (isPrimitive = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]],["passableSymbolForName",[$h͏_a => (passableSymbolForName = $h͏_a)]]]],["./encodeToCapData.js", [["QCLASS",[$h͏_a => (QCLASS = $h͏_a)]]]],["./marshal.js", [["makeMarshal",[$h͏_a => (makeMarshal = $h͏_a)]]]]]);











/**
 * @import {Stringable} from 'ses';
 * @import {Passable} from '@endo/pass-style';
 * @import {Encoding} from './types.js';
 */

const { ownKeys } = Reflect;
const { isArray } = Array;
const { stringify: quote } = JSON;

/**
 * @typedef {object} Indenter
 * @property {(openBracket: string) => number} open
 * @property {() => number} line
 * @property {(token: string) => number} next
 * @property {(closeBracket: string) => number} close
 * @property {() => string} done
 */

/**
 * Generous whitespace for readability
 *
 * @returns {Indenter}
 */
const makeYesIndenter = () => {
  const strings = [];
  let level = 0;
  let needSpace = false;
  const line = () => {
    needSpace = false;
    return strings.push('\n', '  '.repeat(level));
  };
  return harden({
    open: openBracket => {
      level += 1;
      if (needSpace) {
        strings.push(' ');
      }
      needSpace = false;
      return strings.push(openBracket);
    },
    line,
    next: token => {
      if (needSpace && token !== ',' && token !== ')') {
        strings.push(' ');
      }
      needSpace = true;
      return strings.push(token);
    },
    close: closeBracket => {
      assert(level >= 1);
      level -= 1;
      line();
      return strings.push(closeBracket);
    },
    done: () => {
      assert.equal(level, 0);
      return strings.join('');
    },
  });
};

/**
 * If the last character of one token together with the first character
 * of the next token matches this pattern, then the two tokens must be
 * separated by whitespace to preserve their meaning. Otherwise the
 * whitespace in unnecessary.
 *
 * The `<!` and `->` cases prevent the accidental formation of an
 * html-like comment. I don't think the double angle brackets are actually
 * needed but I haven't thought about it enough to remove them.
 */
const badPairPattern = /^(?:\w\w|<<|>>|\+\+|--|<!|->)$/;

/**
 * Minimum whitespace needed to preseve meaning.
 *
 * @returns {Indenter}
 */
const makeNoIndenter = () => {
  /** @type {string[]} */
  const strings = [];
  return harden({
    open: openBracket => strings.push(openBracket),
    line: () => strings.length,
    next: token => {
      if (strings.length >= 1) {
        const last = strings[strings.length - 1];
        // eslint-disable-next-line @endo/restrict-comparison-operands -- error
        if (last.length >= 1 && token.length >= 1) {
          const pair = `${last[last.length - 1]}${token[0]}`;
          if (badPairPattern.test(pair)) {
            strings.push(' ');
          }
        }
      }
      return strings.push(token);
    },
    close: closeBracket => {
      if (strings.length >= 1 && strings[strings.length - 1] === ',') {
        strings.pop();
      }
      return strings.push(closeBracket);
    },
    done: () => strings.join(''),
  });
};

const identPattern = /^[a-zA-Z]\w*$/;
harden(identPattern);
const AtAtPrefixPattern = /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * @param {Encoding} encoding
 * @param {boolean=} shouldIndent
 * @param {any[]} [slots]
 * @returns {string}
 */
const decodeToJustin = (encoding, shouldIndent = false, slots = []) => {
  /**
   * The first pass does some input validation.
   * Its control flow should mirror `recur` as closely as possible
   * and the two should be maintained together. They must visit everything
   * in the same order.
   *
   * TODO now that ibids are gone, we should fold this back together into
   * one validating pass.
   *
   * @param {Encoding} rawTree
   * @returns {void}
   */
  const prepare = rawTree => {
    if (isPrimitive(rawTree)) {
      return;
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      typeof qclass === 'string' ||
        Fail`invalid qclass typeof ${q(typeof qclass)}`;
      assert(!isArray(rawTree));
      switch (rawTree['@qclass']) {
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          return;
        }
        case 'bigint': {
          const { digits } = rawTree;
          typeof digits === 'string' ||
            Fail`invalid digits typeof ${q(typeof digits)}`;
          return;
        }
        case '@@asyncIterator': {
          return;
        }
        case 'symbol': {
          const { name } = rawTree;
          assert.typeof(name, 'string');
          const sym = passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          return;
        }
        case 'tagged': {
          const { tag, payload } = rawTree;
          assert.typeof(tag, 'string');
          prepare(payload);
          return;
        }
        case 'slot': {
          const { index, iface } = rawTree;
          assert.typeof(index, 'number');
          Nat(index);
          if (iface !== undefined) {
            assert.typeof(iface, 'string');
          }
          return;
        }
        case 'hilbert': {
          const { original, rest } = rawTree;
          'original' in rawTree ||
            Fail`Invalid Hilbert Hotel encoding ${rawTree}`;
          prepare(original);
          if ('rest' in rawTree) {
            if (typeof rest !== 'object') {
              throw Fail`Rest ${rest} encoding must be an object`;
            }
            if (rest === null) {
              throw Fail`Rest ${rest} encoding must not be null`;
            }
            if (isArray(rest)) {
              throw Fail`Rest ${rest} encoding must not be an array`;
            }
            if (QCLASS in rest) {
              throw Fail`Rest encoding ${rest} must not contain ${q(QCLASS)}`;
            }
            const names = ownKeys(rest);
            for (const name of names) {
              typeof name === 'string' ||
                Fail`Property name ${name} of ${rawTree} must be a string`;
              prepare(rest[name]);
            }
          }
          return;
        }
        case 'error': {
          const { name, message } = rawTree;
          if (typeof name !== 'string') {
            throw Fail`invalid error name typeof ${q(typeof name)}`;
          }
          getErrorConstructor(name) !== undefined ||
            Fail`Must be the name of an Error constructor ${name}`;
          typeof message === 'string' ||
            Fail`invalid error message typeof ${q(typeof message)}`;
          return;
        }

        default: {
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      for (let i = 0; i < length; i += 1) {
        prepare(rawTree[i]);
      }
    } else {
      const names = ownKeys(rawTree);
      for (const name of names) {
        if (typeof name !== 'string') {
          throw Fail`Property name ${name} of ${rawTree} must be a string`;
        }
        prepare(rawTree[name]);
      }
    }
  };

  const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
  let out = makeIndenter();

  /**
   * This is the second pass recursion after the first pass `prepare`.
   * The first pass did some input validation so
   * here we can safely assume everything those things are validated.
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const decode = rawTree => {
    // eslint-disable-next-line no-use-before-define
    return recur(rawTree);
  };

  const decodeProperty = (name, value) => {
    out.line();
    if (name === '__proto__') {
      // JavaScript interprets `{__proto__: x, ...}`
      // as making an object inheriting from `x`, whereas
      // in JSON it is simply a property name. Preserve the
      // JSON meaning.
      out.next(`["__proto__"]:`);
    } else if (identPattern.test(name)) {
      out.next(`${name}:`);
    } else {
      out.next(`${quote(name)}:`);
    }
    decode(value);
    out.next(',');
  };

  /**
   * Modeled after `fullRevive` in marshal.js
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const recur = rawTree => {
    if (isPrimitive(rawTree)) {
      // primitives get quoted
      return out.next(quote(rawTree));
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      assert.typeof(qclass, 'string');
      assert(!isArray(rawTree));
      // Switching on `encoded[QCLASS]` (or anything less direct, like
      // `qclass`) does not discriminate rawTree in typescript@4.2.3 and
      // earlier.
      switch (rawTree['@qclass']) {
        // Encoding of primitives not handled by JSON
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          // Their qclass is their expression source.
          return out.next(qclass);
        }
        case 'bigint': {
          const { digits } = rawTree;
          assert.typeof(digits, 'string');
          return out.next(`${BigInt(digits)}n`);
        }
        case '@@asyncIterator': {
          // TODO deprecated. Eventually remove.
          return out.next('Symbol.asyncIterator');
        }
        case 'symbol': {
          const { name } = rawTree;
          assert.typeof(name, 'string');
          const sym = passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          const registeredName = nameForPassableSymbol(sym);
          if (registeredName === undefined) {
            const match = AtAtPrefixPattern.exec(name);
            assert(match !== null);
            const suffix = match[1];
            assert(Symbol[suffix] === sym);
            assert(identPattern.test(suffix));
            return out.next(`Symbol.${suffix}`);
          }
          return out.next(`passableSymbolForName(${quote(registeredName)})`);
        }
        case 'tagged': {
          const { tag, payload } = rawTree;
          out.next(`makeTagged(${quote(tag)}`);
          out.next(',');
          decode(payload);
          return out.next(')');
        }

        case 'slot': {
          const { iface } = rawTree;
          const index = Number(Nat(rawTree.index));
          const nestedRender = arg => {
            const oldOut = out;
            try {
              out = makeNoIndenter();
              decode(arg);
              return out.done();
            } finally {
              out = oldOut;
            }
          };
          if (index < slots.length) {
            const renderedSlot = nestedRender(slots[index]);
            return iface === undefined
              ? out.next(`slotToVal(${renderedSlot})`)
              : out.next(`slotToVal(${renderedSlot},${nestedRender(iface)})`);
          }
          return iface === undefined
            ? out.next(`slot(${index})`)
            : out.next(`slot(${index},${nestedRender(iface)})`);
        }

        case 'hilbert': {
          const { original, rest } = rawTree;
          out.open('{');
          decodeProperty(QCLASS, original);
          if ('rest' in rawTree) {
            assert.typeof(rest, 'object');
            assert(rest !== null);
            const names = ownKeys(rest);
            for (const name of names) {
              if (typeof name !== 'string') {
                throw Fail`Property name ${q(
                  name,
                )} of ${rest} must be a string`;
              }
              decodeProperty(name, rest[name]);
            }
          }
          return out.close('}');
        }

        case 'error': {
          const {
            name,
            message,
            cause = undefined,
            errors = undefined,
          } = rawTree;
          cause === undefined ||
            Fail`error cause not yet implemented in marshal-justin`;
          name !== `AggregateError` ||
            Fail`AggregateError not yet implemented in marshal-justin`;
          errors === undefined ||
            Fail`error errors not yet implemented in marshal-justin`;
          return out.next(`${name}(${quote(message)})`);
        }

        default: {
          throw assert.fail(
            X`unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError,
          );
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      if (length === 0) {
        return out.next('[]');
      } else {
        out.open('[');
        for (let i = 0; i < length; i += 1) {
          out.line();
          decode(rawTree[i]);
          out.next(',');
        }
        return out.close(']');
      }
    } else {
      // rawTree is an `EncodingRecord` which only has string keys,
      // but since ownKeys is not generic, it can't propagate that
      const names = /** @type {string[]} */ (ownKeys(rawTree));
      if (names.length === 0) {
        return out.next('{}');
      } else {
        out.open('{');
        for (const name of names) {
          decodeProperty(name, rawTree[name]);
        }
        return out.close('}');
      }
    }
  };
  prepare(encoding);
  decode(encoding);
  return out.done();
};$h͏_once.decodeToJustin(decodeToJustin);
harden(decodeToJustin);


/**
 * @param {Passable} passable
 * @param {boolean} [shouldIndent]
 * @returns {string}
 */
       const passableAsJustin = (passable, shouldIndent = true) => {
  let slotCount = 0;
  // Using post-increment below only so that the indexes start at zero
  // and the `slotCount` variable can be initialized to `0` rather than
  // `-1`.
  // eslint-disable-next-line no-plusplus
  const convertValToSlot = val => `s${slotCount++}`;
  const { toCapData } = makeMarshal(convertValToSlot);
  const { body, slots } = toCapData(passable);
  const encoded = JSON.parse(body);
  return decodeToJustin(encoded, shouldIndent, slots);
};$h͏_once.passableAsJustin(passableAsJustin);
harden(passableAsJustin);

// The example below is the `patt1` test case from `qp-on-pattern.test.js`.
// Please co-maintain the following doc-comment and that test module.
/**
 * `qp` for quote passable as a quasi-quoted Justin expression.
 *
 * Both `q` from `@endo/errors` and this `qp` from `@endo/marshal` can
 * be used together with `Fail`, `X`, etc from `@endo/errors` to mark
 * a substitution value to be both
 * - visually quoted in some useful manner
 * - unredacted
 *
 * Differences:
 * - given a pattern `M.and(M.gte(-100), M.lte(100))`,
 *   ```js
 *   `${q(patt)}`
 *   ```
 *   produces `"[match:and]"`, whereas
 *   ```js
 *   `${qp(patt)}`
 *   ```
 *   produces quasi-quotes Justin of what would be passed:
 *   ```js
 *   `makeTagged("match:and", [
 *     makeTagged("match:gte", -100),
 *     makeTagged("match:lte", 100),
 *   ])`
 *   ```
 * - `q` is lazy, minimizing the cost for using it in an error that's never
 *   logged. Unfortunately, due to layering constraints, `qp` is not
 *   lazy, always rendering to quasi-quoted Justin immediately.
 *
 * Since Justin is a subset of HardenedJS, neither the name `qp` nor the
 * rendered form need to make clear that the rendered form is in Justin rather
 * than HardenedJS.
 *
 * @param {Passable} payload
 * @returns {Stringable}
 */
       const qp = payload => `\`${passableAsJustin(harden(payload), true)}\``;$h͏_once.qp(qp);
harden(qp);
})()
,
// === 44. marshal ./src/encodePassable.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,b,q,Fail,ZERO_N,getTag,makeTagged,passStyleOf,assertRecord,isErrorLike,nameForPassableSymbol,passableSymbolForName;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["b",[$h͏_a => (b = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["@endo/nat", [["ZERO_N",[$h͏_a => (ZERO_N = $h͏_a)]]]],["@endo/pass-style", [["getTag",[$h͏_a => (getTag = $h͏_a)]],["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["assertRecord",[$h͏_a => (assertRecord = $h͏_a)]],["isErrorLike",[$h͏_a => (isErrorLike = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]],["passableSymbolForName",[$h͏_a => (passableSymbolForName = $h͏_a)]]]]]);













/**
 * @import {CopyRecord, PassStyle, Passable, RemotableObject, ByteArray} from '@endo/pass-style'
 */

const { isArray } = Array;
const { fromEntries, is } = Object;
const { ownKeys } = Reflect;

// eslint-disable-next-line no-control-regex
const rC0 = /[\x00-\x1F]/;

/**
 * Return the suffix of a string starting at a particular index.
 * This both expresses intent and potentially avoids slow `substring` in XS.
 * https://github.com/endojs/endo/issues/1984
 *
 * @param {string} str
 * @param {number} index
 * @returns {string}
 */
const getSuffix = (str, index) => (index === 0 ? str : str.substring(index));

/**
 * Assuming that `record` is a CopyRecord, we have only
 * string-named own properties. `recordNames` returns those name *reverse*
 * sorted, because that's how records are compared, encoded, and sorted.
 *
 * @template {Passable} T
 * @param {CopyRecord<T>} record
 * @returns {string[]}
 */
       const recordNames = record =>
  // https://github.com/endojs/endo/pull/1260#discussion_r1003657244
  // compares two ways of reverse sorting, and shows that `.sort().reverse()`
  // is currently faster on Moddable XS, while the other way,
  // `.sort(reverseComparator)`, is faster on v8. We currently care more about
  // XS performance, so we reverse sort using `.sort().reverse()`.
  harden(/** @type {string[]} */ (ownKeys(record)).sort().reverse());$h͏_once.recordNames(recordNames);
harden(recordNames);

/**
 * Assuming that `record` is a CopyRecord and `names` is `recordNames(record)`,
 * return the corresponding array of property values.
 *
 * @template {Passable} T
 * @param {CopyRecord<T>} record
 * @param {string[]} names
 * @returns {T[]}
 */
       const recordValues = (record, names) =>
  harden(names.map(name => record[name]));$h͏_once.recordValues(recordValues);
harden(recordValues);

const zeroes = Array(16)
  .fill(undefined)
  .map((_, i) => '0'.repeat(i));

/**
 * @param {unknown} n
 * @param {number} size
 * @returns {string}
 */
       const zeroPad = (n, size) => {
  const nStr = `${n}`;
  const fillLen = size - nStr.length;
  if (fillLen === 0) return nStr;
  assert(fillLen > 0 && fillLen < zeroes.length);
  return `${zeroes[fillLen]}${nStr}`;
};$h͏_once.zeroPad(zeroPad);
harden(zeroPad);

// This is the JavaScript analog to a C union: a way to map between a float as a
// number and the bits that represent the float as a buffer full of bytes.  Note
// that the mutation of static state here makes this invalid Jessie code, but
// doing it this way saves the nugatory and gratuitous allocations that would
// happen every time you do a conversion -- and in practical terms it's safe
// because we put the value in one side and then immediately take it out the
// other; there is no actual state retained in the classic sense and thus no
// re-entrancy issue.
const asNumber = new Float64Array(1);
const asBits = new BigUint64Array(asNumber.buffer);

// JavaScript numbers are encoded by outputting the base-16
// representation of the binary value of the underlying IEEE floating point
// representation.  For negative values, all bits of this representation are
// complemented prior to the base-16 conversion, while for positive values, the
// sign bit is complemented.  This ensures both that negative values sort before
// positive values and that negative values sort according to their negative
// magnitude rather than their positive magnitude.  This results in an ASCII
// encoding whose lexicographic sort order is the same as the numeric sort order
// of the corresponding numbers.

// TODO Choose the same canonical NaN encoding that cosmWasm and ewasm chose.
const CanonicalNaNBits = 'fff8000000000000';

/**
 * @param {number} n
 * @returns {string}
 */
const encodeBinary64 = n => {
  // Normalize -0 to 0 and NaN to a canonical encoding
  if (is(n, -0)) {
    n = 0;
  } else if (is(n, NaN)) {
    return `f${CanonicalNaNBits}`;
  }
  asNumber[0] = n;
  let bits = asBits[0];
  if (n < 0) {
    bits ^= 0xffffffffffffffffn;
  } else {
    bits ^= 0x8000000000000000n;
  }
  return `f${zeroPad(bits.toString(16), 16)}`;
};

/**
 * @param {string} encoded
 * @param {number} [skip]
 * @returns {number}
 */
const decodeBinary64 = (encoded, skip = 0) => {
  encoded.charAt(skip) === 'f' || Fail`Encoded number expected: ${encoded}`;
  let bits = BigInt(`0x${getSuffix(encoded, skip + 1)}`);
  if (encoded.charAt(skip + 1) < '8') {
    bits ^= 0xffffffffffffffffn;
  } else {
    bits ^= 0x8000000000000000n;
  }
  asBits[0] = bits;
  const result = asNumber[0];
  !is(result, -0) ||
    Fail`Unexpected negative zero: ${getSuffix(encoded, skip)}`;
  return result;
};

/**
 * Encode a JavaScript bigint using a variant of Elias delta coding, with an
 * initial component for the length of the digit count as a unary string, a
 * second component for the decimal digit count, and a third component for the
 * decimal digits preceded by a gratuitous separating colon.
 * To ensure that the lexicographic sort order of encoded values matches the
 * numeric sort order of the corresponding numbers, the characters of the unary
 * prefix are different for negative values (type "n" followed by any number of
 * "#"s [which sort before decimal digits]) vs. positive and zero values (type
 * "p" followed by any number of "~"s [which sort after decimal digits]) and
 * each decimal digit of the encoding for a negative value is replaced with its
 * ten's complement (so that negative values of the same scale sort by
 * *descending* absolute value).
 *
 * @param {bigint} n
 * @returns {string}
 */
const encodeBigInt = n => {
  const abs = n < ZERO_N ? -n : n;
  const nDigits = abs.toString().length;
  const lDigits = nDigits.toString().length;
  if (n < ZERO_N) {
    return `n${
      // A "#" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '#'.repeat(lDigits - 1)
    }${
      // The ten's complement of the count of digits.
      (10 ** lDigits - nDigits).toString().padStart(lDigits, '0')
    }:${
      // The ten's complement of the digits.
      (10n ** BigInt(nDigits) + n).toString().padStart(nDigits, '0')
    }`;
  } else {
    return `p${
      // A "~" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '~'.repeat(lDigits - 1)
    }${
      // The count of digits.
      nDigits
    }:${
      // The digits.
      n
    }`;
  }
};

const rBigIntPayload = /([0-9]+)(:([0-9]+$|)|)/s;

/**
 * @param {string} encoded
 * @returns {bigint}
 */
const decodeBigInt = encoded => {
  const typePrefix = encoded.charAt(0); // faster than encoded[0]
  typePrefix === 'p' ||
    typePrefix === 'n' ||
    Fail`Encoded bigint expected: ${encoded}`;

  const {
    index: lDigits,
    1: snDigits,
    2: tail,
    3: digits,
  } = encoded.match(rBigIntPayload) || Fail`Digit count expected: ${encoded}`;

  snDigits.length === lDigits ||
    Fail`Unary-prefixed decimal digit count expected: ${encoded}`;
  let nDigits = parseInt(snDigits, 10);
  if (typePrefix === 'n') {
    // TODO Assert to reject forbidden encodings
    // like "n0:" and "n00:…" and "n91:…" through "n99:…"?
    nDigits = 10 ** /** @type {number} */ (lDigits) - nDigits;
  }

  tail.charAt(0) === ':' || Fail`Separator expected: ${encoded}`;
  digits.length === nDigits ||
    Fail`Fixed-length digit sequence expected: ${encoded}`;
  let n = BigInt(digits);
  if (typePrefix === 'n') {
    // TODO Assert to reject forbidden encodings
    // like "n9:0" and "n8:00" and "n8:91" through "n8:99"?
    n = -(10n ** BigInt(nDigits) - n);
  }

  return n;
};

/**
 * A sparse array for which every present index maps a code point in the ASCII
 * range to a corresponding escape sequence.
 *
 * Escapes all characters from U+0000 NULL to U+001F INFORMATION SEPARATOR ONE
 * like `!<character offset by 0x21>` to avoid JSON.stringify expansion as
 * `\uHHHH`, and specially escapes U+0020 SPACE (the array element terminator)
 * as `!_` and U+0021 EXCLAMATION MARK (the escape prefix) as `!|` (both chosen
 * for visual approximation).
 * Relative lexicographic ordering is preserved by this mapping of any character
 * at or before `!` in the contiguous range [0x00..0x21] to a respective
 * character in [0x21..0x40, 0x5F, 0x7C] preceded by `!` (which is itself in the
 * replaced range).
 * Similarly, escapes `^` as `_@` and `_` as `__` because `^` indicates the
 * start of an encoded array.
 *
 * @type {Array<string>}
 */
const stringEscapes = Array(0x22)
  .fill(undefined)
  .map((_, cp) => {
    switch (String.fromCharCode(cp)) {
      case ' ':
        return '!_';
      case '!':
        return '!|';
      default:
        return `!${String.fromCharCode(cp + 0x21)}`;
    }
  });
stringEscapes['^'.charCodeAt(0)] = '_@';
stringEscapes['_'.charCodeAt(0)] = '__';

/**
 * Encodes a string with escape sequences for use in the "compactOrdered" format.
 *
 * @type {(str: string) => string}
 */
const encodeCompactStringSuffix = str =>
  str.replace(/[\0-!^_]/g, ch => stringEscapes[ch.charCodeAt(0)]);

/**
 * Decodes a string from the "compactOrdered" format.
 *
 * @type {(encoded: string) => string}
 */
const decodeCompactStringSuffix = encoded => {
  return encoded.replace(/([\0-!_])(.|\n)?/g, (esc, prefix, suffix) => {
    switch (esc) {
      case '!_':
        return ' ';
      case '!|':
        return '!';
      case '_@':
        return '^';
      case '__':
        return '_';
      default: {
        const ch = /** @type {string} */ (suffix);
        // The range of valid `!`-escape suffixes is [(0x00+0x21)..(0x1F+0x21)], i.e.
        // [0x21..0x40] (U+0021 EXCLAMATION MARK to U+0040 COMMERCIAL AT).
        (prefix === '!' && suffix !== undefined && ch >= '!' && ch <= '@') ||
          Fail`invalid string escape: ${q(esc)}`;
        return String.fromCharCode(ch.charCodeAt(0) - 0x21);
      }
    }
  });
};

/**
 * Trivially identity-encodes a string for use in the "legacyOrdered" format.
 *
 * @type {(str: string) => string}
 */
const encodeLegacyStringSuffix = str => str;

/**
 * Trivially identity-decodes a string from the "legacyOrdered" format.
 *
 * @type {(encoded: string) => string}
 */
const decodeLegacyStringSuffix = encoded => encoded;

/**
 * Encodes an array into a sequence of encoded elements for use in the "compactOrdered"
 * format, each terminated by a space (which is part of the escaped range in
 * "compactOrdered" encoded strings).
 *
 * @param {Passable[]} array
 * @param {(p: Passable) => string} encodePassable
 * @returns {string}
 */
const encodeCompactArray = (array, encodePassable) => {
  const chars = ['^'];
  for (const element of array) {
    const enc = encodePassable(element);
    chars.push(enc, ' ');
  }
  return chars.join('');
};

/**
 * @param {string} encoded
 * @param {(encoded: string) => Passable} decodePassable
 * @param {number} [skip]
 * @returns {Array}
 */
const decodeCompactArray = (encoded, decodePassable, skip = 0) => {
  const elements = [];
  let depth = 0;
  // Scan encoded rather than its tail to avoid slow `substring` in XS.
  // https://github.com/endojs/endo/issues/1984
  let nextIndex = skip + 1;
  let currentElementStart = skip + 1;
  for (const { 0: ch, index: i } of encoded.matchAll(/[\^ ]/g)) {
    const index = /** @type {number} */ (i);
    if (index <= skip) {
      if (index === skip) {
        ch === '^' || Fail`Encoded array expected: ${getSuffix(encoded, skip)}`;
      }
    } else if (ch === '^') {
      // This is the start of a nested array.
      // TODO: Since the syntax of nested arrays must be validated as part of
      // decoding the outer one, consider decoding them here into a shared cache
      // rather than discarding information about their contents until the later
      // decodePassable.
      depth += 1;
    } else {
      // This is a terminated element.
      if (index === nextIndex) {
        // A terminator after `[` or an another terminator indicates that an array is done.
        depth -= 1;
        depth >= 0 ||
          // prettier-ignore
          Fail`unexpected array element terminator: ${encoded.slice(skip, index + 2)}`;
      }
      if (depth === 0) {
        // We have a complete element of the topmost array.
        elements.push(
          decodePassable(encoded.slice(currentElementStart, index)),
        );
        currentElementStart = index + 1;
      }
    }
    // Advance the index.
    nextIndex = index + 1;
  }
  depth === 0 || Fail`unterminated array: ${getSuffix(encoded, skip)}`;
  nextIndex === encoded.length ||
    Fail`unterminated array element: ${getSuffix(
      encoded,
      currentElementStart,
    )}`;
  return harden(elements);
};

/**
 * Performs the original array encoding, which escapes all encoded array
 * elements rather than just strings (`\u0000` as the element terminator and
 * `\u0001` as the escape prefix for `\u0000` or `\u0001`).
 * This necessitated an undesirable amount of iteration and expansion; see
 * https://github.com/endojs/endo/pull/1260#discussion_r960369826
 *
 * @param {Passable[]} array
 * @param {(p: Passable) => string} encodePassable
 * @returns {string}
 */
const encodeLegacyArray = (array, encodePassable) => {
  const chars = ['['];
  for (const element of array) {
    const enc = encodePassable(element);
    for (const c of enc) {
      if (c === '\u0000' || c === '\u0001') {
        chars.push('\u0001');
      }
      chars.push(c);
    }
    chars.push('\u0000');
  }
  return chars.join('');
};

/**
 * @param {string} encoded
 * @param {(encoded: string) => Passable} decodePassable
 * @param {number} [skip]
 * @returns {Array}
 */
const decodeLegacyArray = (encoded, decodePassable, skip = 0) => {
  const elements = [];
  const elemChars = [];
  // Use a string iterator to avoid slow indexed access in XS.
  // https://github.com/endojs/endo/issues/1984
  let stillToSkip = skip + 1;
  let inEscape = false;
  for (const c of encoded) {
    if (stillToSkip > 0) {
      stillToSkip -= 1;
      if (stillToSkip === 0) {
        c === '[' || Fail`Encoded array expected: ${getSuffix(encoded, skip)}`;
      }
    } else if (inEscape) {
      c === '\u0000' ||
        c === '\u0001' ||
        Fail`Unexpected character after u0001 escape: ${c}`;
      elemChars.push(c);
    } else if (c === '\u0000') {
      const encodedElement = elemChars.join('');
      elemChars.length = 0;
      const element = decodePassable(encodedElement);
      elements.push(element);
    } else if (c === '\u0001') {
      inEscape = true;
      // eslint-disable-next-line no-continue
      continue;
    } else {
      elemChars.push(c);
    }
    inEscape = false;
  }
  !inEscape || Fail`unexpected end of encoding ${getSuffix(encoded, skip)}`;
  elemChars.length === 0 ||
    Fail`encoding terminated early: ${getSuffix(encoded, skip)}`;
  return harden(elements);
};

/**
 * @param {ByteArray} byteArray
 * @param {(byteArray: ByteArray) => string} _encodePassable
 * @returns {string}
 */
const encodeByteArray = (byteArray, _encodePassable) => {
  // TODO implement
  Fail`encodePassable(byteArray) not yet implemented: ${byteArray}`;
  return ''; // Just for the type
};

const encodeRecord = (record, encodeArray, encodePassable) => {
  const names = recordNames(record);
  const values = recordValues(record, names);
  return `(${encodeArray(harden([names, values]), encodePassable)}`;
};

const decodeRecord = (encoded, decodeArray, decodePassable, skip = 0) => {
  assert(encoded.charAt(skip) === '(');
  // Skip the "(" inside `decodeArray` to avoid slow `substring` in XS.
  // https://github.com/endojs/endo/issues/1984
  const unzippedEntries = decodeArray(encoded, decodePassable, skip + 1);
  unzippedEntries.length === 2 ||
    Fail`expected keys,values pair: ${getSuffix(encoded, skip)}`;
  const [keys, vals] = unzippedEntries;

  (passStyleOf(keys) === 'copyArray' &&
    passStyleOf(vals) === 'copyArray' &&
    keys.length === vals.length &&
    keys.every(key => typeof key === 'string')) ||
    Fail`not a valid record encoding: ${getSuffix(encoded, skip)}`;
  const mapEntries = keys.map((key, i) => [key, vals[i]]);
  const record = harden(fromEntries(mapEntries));
  assertRecord(record, 'decoded record');
  return record;
};

const encodeTagged = (tagged, encodeArray, encodePassable) =>
  `:${encodeArray(harden([getTag(tagged), tagged.payload]), encodePassable)}`;

const decodeTagged = (encoded, decodeArray, decodePassable, skip = 0) => {
  assert(encoded.charAt(skip) === ':');
  // Skip the ":" inside `decodeArray` to avoid slow `substring` in XS.
  // https://github.com/endojs/endo/issues/1984
  const taggedPayload = decodeArray(encoded, decodePassable, skip + 1);
  taggedPayload.length === 2 ||
    Fail`expected tag,payload pair: ${getSuffix(encoded, skip)}`;
  const [tag, payload] = taggedPayload;
  passStyleOf(tag) === 'string' ||
    Fail`not a valid tagged encoding: ${getSuffix(encoded, skip)}`;
  return makeTagged(tag, payload);
};

const makeEncodeRemotable = (unsafeEncodeRemotable, verifyEncoding) => {
  const encodeRemotable = (r, innerEncode) => {
    const encoding = unsafeEncodeRemotable(r, innerEncode);
    (typeof encoding === 'string' && encoding.charAt(0) === 'r') ||
      Fail`Remotable encoding must start with "r": ${encoding}`;
    verifyEncoding(encoding, 'Remotable');
    return encoding;
  };
  return encodeRemotable;
};

const makeEncodePromise = (unsafeEncodePromise, verifyEncoding) => {
  const encodePromise = (p, innerEncode) => {
    const encoding = unsafeEncodePromise(p, innerEncode);
    (typeof encoding === 'string' && encoding.charAt(0) === '?') ||
      Fail`Promise encoding must start with "?": ${encoding}`;
    verifyEncoding(encoding, 'Promise');
    return encoding;
  };
  return encodePromise;
};

const makeEncodeError = (unsafeEncodeError, verifyEncoding) => {
  const encodeError = (err, innerEncode) => {
    const encoding = unsafeEncodeError(err, innerEncode);
    (typeof encoding === 'string' && encoding.charAt(0) === '!') ||
      Fail`Error encoding must start with "!": ${encoding}`;
    verifyEncoding(encoding, 'Error');
    return encoding;
  };
  return encodeError;
};

/**
 * @typedef {object} EncodeOptions
 * @property {(
 *   remotable: RemotableObject,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeRemotable]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodePromise]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeError]
 * @property {'legacyOrdered' | 'compactOrdered'} [format]
 */

/**
 * @param {(str: string) => string} encodeStringSuffix
 * @param {(arr: unknown[], encodeRecur: (p: Passable) => string) => string} encodeArray
 * @param {Required<EncodeOptions> & {verifyEncoding?: (encoded: string, label: string) => void}} options
 * @returns {(p: Passable) => string}
 */
const makeInnerEncode = (encodeStringSuffix, encodeArray, options) => {
  const {
    encodeRemotable: unsafeEncodeRemotable,
    encodePromise: unsafeEncodePromise,
    encodeError: unsafeEncodeError,
    verifyEncoding = () => {},
  } = options;
  const encodeRemotable = makeEncodeRemotable(
    unsafeEncodeRemotable,
    verifyEncoding,
  );
  const encodePromise = makeEncodePromise(unsafeEncodePromise, verifyEncoding);
  const encodeError = makeEncodeError(unsafeEncodeError, verifyEncoding);

  const innerEncode = passable => {
    if (isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      return encodeError(passable, innerEncode);
    }
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null': {
        return 'v';
      }
      case 'undefined': {
        return 'z';
      }
      case 'number': {
        return encodeBinary64(passable);
      }
      case 'string': {
        return `s${encodeStringSuffix(passable)}`;
      }
      case 'boolean': {
        return `b${passable}`;
      }
      case 'bigint': {
        return encodeBigInt(passable);
      }
      case 'remotable': {
        return encodeRemotable(passable, innerEncode);
      }
      case 'error': {
        return encodeError(passable, innerEncode);
      }
      case 'promise': {
        return encodePromise(passable, innerEncode);
      }
      case 'symbol': {
        // Strings and symbols share encoding logic.
        const name = nameForPassableSymbol(passable);
        assert.typeof(name, 'string');
        return `y${encodeStringSuffix(name)}`;
      }
      case 'copyArray': {
        return encodeArray(passable, innerEncode);
      }
      case 'byteArray': {
        return encodeByteArray(passable, innerEncode);
      }
      case 'copyRecord': {
        return encodeRecord(passable, encodeArray, innerEncode);
      }
      case 'tagged': {
        return encodeTagged(passable, encodeArray, innerEncode);
      }
      default: {
        throw Fail`a ${q(passStyle)} cannot be used as a collection passable`;
      }
    }
  };
  return innerEncode;
};

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: string,
 *   decodeRecur: (e: string) => Passable
 * ) => RemotableObject} [decodeRemotable]
 * @property {(
 *   encodedPromise: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Promise} [decodePromise]
 * @property {(
 *   encodedError: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Error} [decodeError]
 */

const liberalDecoders = /** @type {Required<DecodeOptions>} */ (
  /** @type {unknown} */ ({
    decodeRemotable: (_encoding, _innerDecode) => undefined,
    decodePromise: (_encoding, _innerDecode) => undefined,
    decodeError: (_encoding, _innerDecode) => undefined,
  })
);

/**
 * @param {(encoded: string) => string} decodeStringSuffix
 * @param {(encoded: string, decodeRecur: (e: string) => Passable, skip?: number) => unknown[]} decodeArray
 * @param {Required<DecodeOptions>} options
 * @returns {(encoded: string, skip?: number) => Passable}
 */
const makeInnerDecode = (decodeStringSuffix, decodeArray, options) => {
  const { decodeRemotable, decodePromise, decodeError } = options;
  /** @type {(encoded: string, skip?: number) => Passable} */
  const innerDecode = (encoded, skip = 0) => {
    switch (encoded.charAt(skip)) {
      case 'v': {
        return null;
      }
      case 'z': {
        return undefined;
      }
      case 'f': {
        return decodeBinary64(encoded, skip);
      }
      case 's': {
        return decodeStringSuffix(getSuffix(encoded, skip + 1));
      }
      case 'b': {
        const substring = getSuffix(encoded, skip + 1);
        if (substring === 'true') {
          return true;
        } else if (substring === 'false') {
          return false;
        }
        throw Fail`expected encoded boolean to be "btrue" or "bfalse": ${substring}`;
      }
      case 'n':
      case 'p': {
        return decodeBigInt(getSuffix(encoded, skip));
      }
      case 'r': {
        return decodeRemotable(getSuffix(encoded, skip), innerDecode);
      }
      case '?': {
        return decodePromise(getSuffix(encoded, skip), innerDecode);
      }
      case '!': {
        return decodeError(getSuffix(encoded, skip), innerDecode);
      }
      case 'y': {
        // Strings and symbols share decoding logic.
        const name = decodeStringSuffix(getSuffix(encoded, skip + 1));
        return passableSymbolForName(name);
      }
      case '[':
      case '^': {
        // @ts-expect-error Type 'unknown[]' is not Passable
        return decodeArray(encoded, innerDecode, skip);
      }
      case '(': {
        return decodeRecord(encoded, decodeArray, innerDecode, skip);
      }
      case ':': {
        return decodeTagged(encoded, decodeArray, innerDecode, skip);
      }
      default: {
        throw Fail`invalid database key: ${getSuffix(encoded, skip)}`;
      }
    }
  };
  return innerDecode;
};

/**
 * @typedef {object} PassableKit
 * @property {ReturnType<makeInnerEncode>} encodePassable
 * @property {ReturnType<makeInnerDecode>} decodePassable
 */

/**
 * @param {EncodeOptions & DecodeOptions} [options]
 * @returns {PassableKit}
 */
       const makePassableKit = (options = {}) => {
  const {
    encodeRemotable = (r, _) => Fail`remotable unexpected: ${r}`,
    encodePromise = (p, _) => Fail`promise unexpected: ${p}`,
    encodeError = (err, _) => Fail`error unexpected: ${err}`,
    format = 'legacyOrdered',

    decodeRemotable = (encoding, _) => Fail`remotable unexpected: ${encoding}`,
    decodePromise = (encoding, _) => Fail`promise unexpected: ${encoding}`,
    decodeError = (encoding, _) => Fail`error unexpected: ${encoding}`,
  } = options;

  /** @type {PassableKit['encodePassable']} */
  let encodePassable;
  const encodeOptions = { encodeRemotable, encodePromise, encodeError, format };
  if (format === 'compactOrdered') {
    const liberalDecode = makeInnerDecode(
      decodeCompactStringSuffix,
      decodeCompactArray,
      liberalDecoders,
    );
    /**
     * @param {string} encoding
     * @param {string} label
     * @returns {void}
     */
    const verifyEncoding = (encoding, label) => {
      !encoding.match(rC0) ||
        Fail`${b(
          label,
        )} encoding must not contain a C0 control character: ${encoding}`;
      const decoded = decodeCompactArray(`^v ${encoding} v `, liberalDecode);
      (isArray(decoded) &&
        decoded.length === 3 &&
        decoded[0] === null &&
        decoded[2] === null) ||
        Fail`${b(label)} encoding must be embeddable: ${encoding}`;
    };
    const encodeCompact = makeInnerEncode(
      encodeCompactStringSuffix,
      encodeCompactArray,
      { ...encodeOptions, verifyEncoding },
    );
    encodePassable = passable => `~${encodeCompact(passable)}`;
  } else if (format === 'legacyOrdered') {
    encodePassable = makeInnerEncode(
      encodeLegacyStringSuffix,
      encodeLegacyArray,
      encodeOptions,
    );
  } else {
    throw Fail`Unrecognized format: ${q(format)}`;
  }

  const decodeOptions = { decodeRemotable, decodePromise, decodeError };
  const decodeCompact = makeInnerDecode(
    decodeCompactStringSuffix,
    decodeCompactArray,
    decodeOptions,
  );
  const decodeLegacy = makeInnerDecode(
    decodeLegacyStringSuffix,
    decodeLegacyArray,
    decodeOptions,
  );
  const decodePassable = encoded => {
    // A leading "~" indicates the v2 encoding (with escaping in strings rather than arrays).
    // Skip it inside `decodeCompact` to avoid slow `substring` in XS.
    // https://github.com/endojs/endo/issues/1984
    if (encoded.charAt(0) === '~') {
      return decodeCompact(encoded, 1);
    }
    return decodeLegacy(encoded);
  };

  return harden({ encodePassable, decodePassable });
};$h͏_once.makePassableKit(makePassableKit);
harden(makePassableKit);

/**
 * @param {EncodeOptions} [encodeOptions]
 * @returns {PassableKit['encodePassable']}
 */
       const makeEncodePassable = encodeOptions => {
  const { encodePassable } = makePassableKit(encodeOptions);
  return encodePassable;
};$h͏_once.makeEncodePassable(makeEncodePassable);
harden(makeEncodePassable);

/**
 * @param {DecodeOptions} [decodeOptions]
 * @returns {PassableKit['decodePassable']}
 */
       const makeDecodePassable = decodeOptions => {
  const { decodePassable } = makePassableKit(decodeOptions);
  return decodePassable;
};$h͏_once.makeDecodePassable(makeDecodePassable);
harden(makeDecodePassable);

       const isEncodedRemotable = encoded => encoded.charAt(0) === 'r';$h͏_once.isEncodedRemotable(isEncodedRemotable);
harden(isEncodedRemotable);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {Record<PassStyle, string>}
 * The single prefix characters to be used for each PassStyle category.
 * `bigint` is a two-character string because each of those characters
 * individually is a valid bigint prefix (`n` for "negative" and `p` for
 * "positive"), and copyArray is a two-character string because one encoding
 * prefixes arrays with `[` while the other uses `^` (which is prohibited from
 * appearing in an encoded string).
 * The ordering of these prefixes is the same as the rankOrdering of their
 * respective PassStyles, and rankOrder.js imports the table for this purpose.
 *
 * In addition, `|` is the remotable->ordinal mapping prefix:
 * This is not used in covers but it is
 * reserved from the same set of strings. Note that the prefix is > any
 * prefix used by any cover so that ordinal mapping keys are always outside
 * the range of valid collection entry keys.
 */
       const passStylePrefixes = {
  error: '!',
  copyRecord: '(',
  tagged: ':',
  promise: '?',
  copyArray: '[^',
  byteArray: 'a',
  boolean: 'b',
  number: 'f',
  bigint: 'np',
  remotable: 'r',
  string: 's',
  null: 'v',
  symbol: 'y',
  // Because Array.prototype.sort puts undefined values at the end without
  // passing them to a comparison function, undefined MUST be the last
  // category.
  undefined: 'z',
};$h͏_once.passStylePrefixes(passStylePrefixes);
Object.setPrototypeOf(passStylePrefixes, null);
harden(passStylePrefixes);
})()
,
// === 45. marshal ./src/rankOrder.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,getenv,Fail,q,getTag,passStyleOf,nameForPassableSymbol,passStylePrefixes,recordNames,recordValues;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getenv = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]]]],["@endo/pass-style", [["getTag",[$h͏_a => (getTag = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]]]],["./encodePassable.js", [["passStylePrefixes",[$h͏_a => (passStylePrefixes = $h͏_a)]],["recordNames",[$h͏_a => (recordNames = $h͏_a)]],["recordValues",[$h͏_a => (recordValues = $h͏_a)]]]]]);









/**
 * @import {Passable, PassStyle} from '@endo/pass-style'
 * @import {FullCompare, PartialCompare, PartialComparison, RankCompare, RankComparison, RankCover} from './types.js'
 */

const { isNaN: NumberIsNaN } = Number;
const { entries, fromEntries, setPrototypeOf, is } = Object;

const ENDO_RANK_STRINGS = getenv('ENDO_RANK_STRINGS', 'utf16-code-unit-order', [
  'unicode-code-point-order',
  'error-if-order-choice-matters',
]);

/**
 * @typedef {object} RankComparatorKit
 * @property {RankCompare} comparator
 * @property {RankCompare} antiComparator
 */

/**
 * @typedef {object} FullComparatorKit
 * @property {FullCompare} comparator
 * @property {FullCompare} antiComparator
 */

/**
 * @typedef {[number, number]} IndexCover
 */

/**
 * This is the equality comparison used by JavaScript's Map and Set
 * abstractions, where NaN is the same as NaN and -0 is the same as
 * 0. Marshal still serializes -0 as zero, so the semantics of our distributed
 * object system does not yet distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
const sameValueZero = (x, y) => x === y || is(x, y);

/**
 * @param {any} left
 * @param {any} right
 * @returns {RankComparison}
 */
const trivialComparator = (left, right) =>
  // eslint-disable-next-line no-nested-ternary, @endo/restrict-comparison-operands
  left < right ? -1 : left === right ? 0 : 1;
harden(trivialComparator);

// Apparently eslint confused about whether the function can ever exit
// without an explicit return.
// eslint-disable-next-line jsdoc/require-returns-check
/**
 * @param {string} left
 * @param {string} right
 * @returns {RankComparison}
 */
       const compareByCodePoints = (left, right) => {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  for (;;) {
    const { value: leftChar } = leftIter.next();
    const { value: rightChar } = rightIter.next();
    if (leftChar === undefined && rightChar === undefined) {
      return 0;
    } else if (leftChar === undefined) {
      // left is a prefix of right.
      return -1;
    } else if (rightChar === undefined) {
      // right is a prefix of left.
      return 1;
    }
    const leftCodepoint = /** @type {number} */ (leftChar.codePointAt(0));
    const rightCodepoint = /** @type {number} */ (rightChar.codePointAt(0));
    if (leftCodepoint < rightCodepoint) return -1;
    if (leftCodepoint > rightCodepoint) return 1;
  }
};$h͏_once.compareByCodePoints(compareByCodePoints);
harden(compareByCodePoints);

/**
 * Compare two same-type numeric values, returning results consistent with
 * `compareRank`'s "rank order" (i.e., treating both positive and negative zero
 * as equal and placing NaN as self-equal after all other numbers).
 *
 * @template {number | bigint} T
 * @param {T} left
 * @param {T} right
 * @returns {RankComparison}
 */
       const compareNumerics = (left, right) => {
  // eslint-disable-next-line @endo/restrict-comparison-operands
  if (left < right) return -1;
  // eslint-disable-next-line @endo/restrict-comparison-operands
  if (left > right) return 1;
  if (NumberIsNaN(left) === NumberIsNaN(right)) return 0;
  if (NumberIsNaN(right)) return -1;
  assert(NumberIsNaN(left));
  return 1;
};$h͏_once.compareNumerics(compareNumerics);
harden(compareNumerics);

/**
 * @typedef {Record<PassStyle, { index: number, cover: RankCover }>} PassStyleRanksRecord
 */

const passStyleRanks = /** @type {PassStyleRanksRecord} */ (
  fromEntries(
    entries(passStylePrefixes)
      // Sort entries by ascending prefix, assuming that all prefixes are
      // limited to the Basic Multilingual Plane (U+0000 through U+FFFF) and
      // thus contain only code units that are equivalent to code points.
      // In practice, they are entirely printable ASCII
      // (0x20 SPACE through 0x7E TILDE).
      .sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes]) => {
        return trivialComparator(leftPrefixes, rightPrefixes);
      })
      .map(([passStyle, prefixes], index) => {
        // Verify that `prefixes` is sorted, and cover all strings that start
        // with any of its characters, i.e.
        // all s such that prefixes.at(0) ≤ s < successor(prefixes.at(-1)).
        prefixes === prefixes.split('').sort().join('') ||
          Fail`unsorted prefixes for passStyle ${q(passStyle)}: ${q(prefixes)}`;
        const cover = [
          prefixes.charAt(0),
          String.fromCharCode(prefixes.charCodeAt(prefixes.length - 1) + 1),
        ];
        return [passStyle, { index, cover }];
      }),
  )
);
setPrototypeOf(passStyleRanks, null);
harden(passStyleRanks);

/**
 * Associate with each passStyle a RankCover that may be an overestimate,
 * and whose results therefore need to be filtered down. For example, because
 * there is not a smallest or biggest bigint, bound it by `NaN` (the last place
 * number) and `''` (the empty string, which is the first place string). Thus,
 * a range query using this range may include these values, which would then
 * need to be filtered out.
 *
 * @param {PassStyle} passStyle
 * @returns {RankCover}
 */
       const getPassStyleCover = passStyle => passStyleRanks[passStyle].cover;$h͏_once.getPassStyleCover(getPassStyleCover);
harden(getPassStyleCover);

/**
 * @type {WeakMap<RankCompare,WeakSet<Passable[]>>}
 */
const memoOfSorted = new WeakMap();

/**
 * @type {WeakMap<RankCompare,RankCompare>}
 */
const comparatorMirrorImages = new WeakMap();

/**
 * @param {PartialCompare} [compareRemotables]
 * A comparator for assigning an internal order to remotables.
 * It defaults to a function that always returns `NaN`, meaning that all
 * remotables are incomparable and should tie for the same rank by
 * short-circuiting without further refinement (e.g., not only are `r1` and `r2`
 * tied, but so are `[r1, 0]` and `[r2, "x"]`).
 * @returns {RankComparatorKit}
 */
       const makeComparatorKit = (compareRemotables = (_x, _y) => NaN) => {
  /** @type {PartialCompare} */
  const comparator = (left, right) => {
    if (sameValueZero(left, right)) {
      return 0;
    }
    const leftStyle = passStyleOf(left);
    const rightStyle = passStyleOf(right);
    if (leftStyle !== rightStyle) {
      return compareNumerics(
        passStyleRanks[leftStyle].index,
        passStyleRanks[rightStyle].index,
      );
    }
    /* eslint-disable @endo/restrict-comparison-operands --
     * We know `left` and `right` are comparable.
     */
    switch (leftStyle) {
      case 'remotable': {
        return compareRemotables(left, right);
      }
      case 'undefined':
      case 'null':
      case 'error':
      case 'promise': {
        // For each of these passStyles, all members of that passStyle are tied
        // for the same rank.
        return 0;
      }
      case 'boolean':
      case 'bigint': {
        // Within each of these passStyles, the rank ordering agrees with
        // JavaScript's relational operators `<` and `>`.
        return trivialComparator(left, right);
      }
      case 'string': {
        switch (ENDO_RANK_STRINGS) {
          case 'utf16-code-unit-order': {
            return trivialComparator(left, right);
          }
          case 'unicode-code-point-order': {
            return compareByCodePoints(left, right);
          }
          case 'error-if-order-choice-matters': {
            const result1 = trivialComparator(left, right);
            const result2 = compareByCodePoints(left, right);
            result1 === result2 ||
              Fail`Comparisons differed: ${left} vs ${right}, ${q(result1)} vs ${q(result2)}`;
            return result1;
          }
          default: {
            throw Fail`Unexpected ENDO_RANK_STRINGS ${q(ENDO_RANK_STRINGS)}`;
          }
        }
      }
      case 'symbol': {
        return comparator(
          nameForPassableSymbol(left),
          nameForPassableSymbol(right),
        );
      }
      case 'number': {
        return compareNumerics(left, right);
      }
      case 'copyRecord': {
        // Lexicographic by inverse sorted order of property names, then
        // lexicographic by corresponding values in that same inverse
        // order of their property names. Comparing names by themselves first,
        // all records with the exact same set of property names sort next to
        // each other in a rank-sort of copyRecords.

        // The copyRecord invariants enforced by passStyleOf ensure that
        // all the property names are strings. We need the reverse sorted order
        // of these names, which we then compare lexicographically. This ensures
        // that if the names of record X are a subset of the names of record Y,
        // then record X will have an earlier rank and sort to the left of Y.
        const leftNames = recordNames(left);
        const rightNames = recordNames(right);

        const result = comparator(leftNames, rightNames);
        if (result !== 0) {
          return result;
        }
        const leftValues = recordValues(left, leftNames);
        const rightValues = recordValues(right, rightNames);
        return comparator(leftValues, rightValues);
      }
      case 'copyArray': {
        // Lexicographic
        const len = Math.min(left.length, right.length);
        for (let i = 0; i < len; i += 1) {
          const result = comparator(left[i], right[i]);
          if (result !== 0) {
            return result;
          }
        }
        // If all matching elements were tied, then according to their lengths.
        // If array X is a prefix of array Y, then X has an earlier rank than Y.
        return comparator(left.length, right.length);
      }
      case 'byteArray': {
        // ByteArrays compare by shortlex.
        // - first, if they are of unequal length, then the shorter is less.
        // - then, among byteArrays of equal length, by lexicographic comparison
        //   of their bytes in ascending order.
        const { byteLength: leftLen } = left;
        const { byteLength: rightLen } = right;
        if (leftLen < rightLen) {
          return -1;
        }
        if (leftLen > rightLen) {
          return 1;
        }

        // Account for gaps in the @endo/immutable-arraybuffer shim.
        const leftArray =
          Object.getPrototypeOf(left) === ArrayBuffer.prototype
            ? new Uint8Array(left)
            : new Uint8Array(left.slice(0));
        const rightArray =
          Object.getPrototypeOf(right) === ArrayBuffer.prototype
            ? new Uint8Array(right)
            : new Uint8Array(right.slice(0));
        for (let i = 0; i < leftLen; i += 1) {
          const leftByte = leftArray[i];
          const rightByte = rightArray[i];
          if (leftByte < rightByte) {
            return -1;
          }
          if (leftByte > rightByte) {
            return 1;
          }
        }
        return 0;
      }
      case 'tagged': {
        // Lexicographic by `[Symbol.toStringTag]` then `.payload`.
        const labelComp = comparator(getTag(left), getTag(right));
        if (labelComp !== 0) {
          return labelComp;
        }
        return comparator(left.payload, right.payload);
      }
      default: {
        throw Fail`Unrecognized passStyle: ${q(leftStyle)}`;
      }
    }
    /* eslint-enable */
  };

  /** @type {RankCompare} */
  const outerComparator = (x, y) =>
    // When the inner comparator returns NaN to indicate incomparability,
    // replace that with 0 to indicate a tie.
    /** @type {Exclude<PartialComparison, NaN>} */ (comparator(x, y) || 0);

  /** @type {RankCompare} */
  const antiComparator = (x, y) => outerComparator(y, x);

  memoOfSorted.set(outerComparator, new WeakSet());
  memoOfSorted.set(antiComparator, new WeakSet());
  comparatorMirrorImages.set(outerComparator, antiComparator);
  comparatorMirrorImages.set(antiComparator, outerComparator);

  return harden({ comparator: outerComparator, antiComparator });
};$h͏_once.makeComparatorKit(makeComparatorKit);
harden(makeComparatorKit);

/**
 * @param {RankCompare} comparator
 * @returns {RankCompare=}
 */
       const comparatorMirrorImage = comparator =>
  comparatorMirrorImages.get(comparator);$h͏_once.comparatorMirrorImage(comparatorMirrorImage);
harden(comparatorMirrorImage);

       const { comparator: compareRank, antiComparator: compareAntiRank } =
  makeComparatorKit();

/**
 * @param {Passable[]} passables
 * @param {RankCompare} compare
 * @returns {boolean}
 */$h͏_once.compareRank(compareRank);$h͏_once.compareAntiRank(compareAntiRank);
       const isRankSorted = (passables, compare) => {
  const subMemoOfSorted = memoOfSorted.get(compare);
  assert(subMemoOfSorted !== undefined);
  if (subMemoOfSorted.has(passables)) {
    return true;
  }
  assert(passStyleOf(passables) === 'copyArray');
  for (let i = 1; i < passables.length; i += 1) {
    if (compare(passables[i - 1], passables[i]) >= 1) {
      return false;
    }
  }
  subMemoOfSorted.add(passables);
  return true;
};$h͏_once.isRankSorted(isRankSorted);
harden(isRankSorted);

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 */
       const assertRankSorted = (sorted, compare) =>
  isRankSorted(sorted, compare) ||
  // TODO assert on bug could lead to infinite recursion. Fix.
  // eslint-disable-next-line no-use-before-define
  Fail`Must be rank sorted: ${sorted} vs ${sortByRank(sorted, compare)}`;$h͏_once.assertRankSorted(assertRankSorted);
harden(assertRankSorted);

/**
 * @template {Passable} T
 * @param {Iterable<T>} passables
 * @param {RankCompare} compare
 * @returns {T[]}
 */
       const sortByRank = (passables, compare) => {
  /** @type {T[]} mutable for in-place sorting, but with hardened elements */
  let unsorted;
  if (Array.isArray(passables)) {
    harden(passables);
    // Calling isRankSorted gives it a chance to get memoized for
    // this `compare` function even if it was already memoized for a different
    // `compare` function.
    if (isRankSorted(passables, compare)) {
      return passables;
    }
    unsorted = [...passables];
  } else {
    unsorted = Array.from(passables, harden);
  }
  const sorted = unsorted.sort(compare);
  // For reverse comparison, move `undefined` values from the end to the start.
  // Note that passStylePrefixes (@see {@link ./encodePassable.js}) MUST NOT
  // sort any category after `undefined`.
  if (compare(true, undefined) > 0) {
    let i = sorted.length - 1;
    while (i >= 0 && sorted[i] === undefined) i -= 1;
    const n = sorted.length - i - 1;
    if (n > 0 && n < sorted.length) {
      sorted.copyWithin(n, 0);
      sorted.fill(/** @type {T} */ (undefined), 0, n);
    }
  }
  harden(sorted);
  const subMemoOfSorted = memoOfSorted.get(compare);
  assert(subMemoOfSorted !== undefined);
  subMemoOfSorted.add(sorted);
  return sorted;
};$h͏_once.sortByRank(sortByRank);
harden(sortByRank);

/**
 * See
 * https://en.wikipedia.org/wiki/Binary_search_algorithm#Procedure_for_finding_the_leftmost_element
 *
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {Passable} key
 * @param {("leftMost" | "rightMost")=} bias
 * @returns {number}
 */
const rankSearch = (sorted, compare, key, bias = 'leftMost') => {
  assertRankSorted(sorted, compare);
  let left = 0;
  let right = sorted.length;
  while (left < right) {
    const m = Math.floor((left + right) / 2);
    const comp = compare(sorted[m], key);
    if (comp <= -1 || (comp === 0 && bias === 'rightMost')) {
      left = m + 1;
    } else {
      assert(comp >= 1 || (comp === 0 && bias === 'leftMost'));
      right = m;
    }
  }
  return bias === 'leftMost' ? left : right - 1;
};

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {RankCover} rankCover
 * @returns {IndexCover}
 */
       const getIndexCover = (sorted, compare, [leftKey, rightKey]) => {
  assertRankSorted(sorted, compare);
  const leftIndex = rankSearch(sorted, compare, leftKey, 'leftMost');
  const rightIndex = rankSearch(sorted, compare, rightKey, 'rightMost');
  return [leftIndex, rightIndex];
};$h͏_once.getIndexCover(getIndexCover);
harden(getIndexCover);

/** @type {RankCover} */
       const FullRankCover = harden(['', '{']);

/**
 * @param {Passable[]} sorted
 * @param {IndexCover} indexCover
 * @returns {Iterable<[number, Passable]>}
 */$h͏_once.FullRankCover(FullRankCover);
       const coveredEntries = (sorted, [leftIndex, rightIndex]) => {
  /** @type {Iterable<[number, Passable]>} */
  const iterable = harden({
    [Symbol.iterator]: () => {
      let i = leftIndex;
      return harden({
        next: () => {
          if (i <= rightIndex) {
            const element = sorted[i];
            i += 1;
            return harden({ value: [i, element], done: false });
          } else {
            return harden({ value: undefined, done: true });
          }
        },
      });
    },
  });
  return iterable;
};$h͏_once.coveredEntries(coveredEntries);
harden(coveredEntries);

/**
 * @template {Passable} T
 * @param {RankCompare} compare
 * @param {T} a
 * @param {T} b
 * @returns {T}
 */
const maxRank = (compare, a, b) => (compare(a, b) >= 0 ? a : b);

/**
 * @template {Passable} T
 * @param {RankCompare} compare
 * @param {T} a
 * @param {T} b
 * @returns {T}
 */
const minRank = (compare, a, b) => (compare(a, b) <= 0 ? a : b);

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
       const unionRankCovers = (compare, covers) => {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const unionRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
    minRank(compare, leftA, leftB),
    maxRank(compare, rightA, rightB),
  ];
  return covers.reduce(unionRankCoverPair, ['{', '']);
};$h͏_once.unionRankCovers(unionRankCovers);
harden(unionRankCovers);

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
       const intersectRankCovers = (compare, covers) => {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const intersectRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
    maxRank(compare, leftA, leftB),
    minRank(compare, rightA, rightB),
  ];
  return covers.reduce(intersectRankCoverPair, ['', '{']);
};$h͏_once.intersectRankCovers(intersectRankCovers);
harden(intersectRankCovers);

/**
 * Create a comparator kit in which remotables are fully ordered
 * by the order in which they are first seen by *this* comparator kit.
 * BEWARE: This is observable mutable state, so such a comparator kit
 * should never be shared among subsystems that should not be able
 * to communicate.
 *
 * Note that this order does not meet the requirements for store
 * ordering, since it has no memory of deleted keys.
 *
 * These full order comparator kit is strictly more precise that the
 * rank order comparator kits above. As a result, any array which is
 * sorted by such a full order will pass the isRankSorted test with
 * a corresponding rank order.
 *
 * An array which is sorted by a *fresh* full order comparator, i.e.,
 * one that has not yet seen any remotables, will of course remain
 * sorted by according to *that* full order comparator. An array *of
 * scalars* sorted by a fresh full order will remain sorted even
 * according to a new fresh full order comparator, since it will see
 * the remotables in the same order again. Unfortunately, this is
 * not true of arrays of passables in general.
 *
 * @param {boolean=} longLived
 * @returns {FullComparatorKit}
 */
       const makeFullOrderComparatorKit = (longLived = false) => {
  let numSeen = 0;
  // When dynamically created with short lifetimes (the default) a WeakMap
  // would perform poorly, and the leak created by a Map only lasts as long
  // as the Map.
  const MapConstructor = longLived ? WeakMap : Map;
  const seen = new MapConstructor();
  const tag = r => {
    if (seen.has(r)) {
      return seen.get(r);
    }
    numSeen += 1;
    seen.set(r, numSeen);
    return numSeen;
  };
  const compareRemotables = (x, y) => compareRank(tag(x), tag(y));
  return makeComparatorKit(compareRemotables);
};$h͏_once.makeFullOrderComparatorKit(makeFullOrderComparatorKit);
harden(makeFullOrderComparatorKit);
})()
,
// === 46. marshal ./src/types.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 47. marshal ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/encodeToCapData.js", []],["./src/marshal.js", []],["./src/marshal-stringify.js", []],["./src/marshal-justin.js", []],["./src/encodePassable.js", []],["./src/rankOrder.js", []],["./src/types.js", []],["@endo/pass-style", []]]);
})()
,
// === 48. captp ./src/trap.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);



const { freeze } = Object;

/**
 * Default implementation of Trap for near objects.
 *
 * @type {import('./types.js').TrapImpl}
 */
       const nearTrapImpl = harden({
  applyFunction(target, args) {
    return target(...args);
  },
  applyMethod(target, prop, args) {
    return target[prop](...args);
  },
  get(target, prop) {
    return target[prop];
  },
});

/** @type {ProxyHandler<any>} */$h͏_once.nearTrapImpl(nearTrapImpl);
const baseFreezableProxyHandler = {
  set(_target, _prop, _value) {
    return false;
  },
  isExtensible(_target) {
    return false;
  },
  setPrototypeOf(_target, _value) {
    return false;
  },
  deleteProperty(_target, _prop) {
    return false;
  },
};

/**
 * A Proxy handler for Trap(x)
 *
 * @param {any} x Any value passed to Trap(x)
 * @param {import('./types.js').TrapImpl} trapImpl
 * @returns {ProxyHandler}
 */
const TrapProxyHandler = (x, trapImpl) => {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, _receiver) {
      return (...args) => trapImpl.applyMethod(x, p, args);
    },
    apply(_target, _thisArg, argArray = []) {
      return trapImpl.applyFunction(x, argArray);
    },
    has(_target, _p) {
      // TODO: has property is not yet transferrable over captp.
      return true;
    },
  });
};

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const funcTarget = freeze(() => {});

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const objTarget = freeze({ __proto__: null });

/**
 * @param {import('./types.js').TrapImpl} trapImpl
 * @returns {import('./ts-types.js').Trap}
 */
       const makeTrap = trapImpl => {
  const Trap = x => {
    const handler = TrapProxyHandler(x, trapImpl);
    return new Proxy(funcTarget, handler);
  };

  const makeTrapGetterProxy = x => {
    const handler = harden({
      ...baseFreezableProxyHandler,
      has(_target, _prop) {
        // TODO: has property is not yet transferrable over captp.
        return true;
      },
      get(_target, prop) {
        return trapImpl.get(x, prop);
      },
    });
    return new Proxy(objTarget, handler);
  };
  Trap.get = makeTrapGetterProxy;

  return harden(Trap);
};$h͏_once.makeTrap(makeTrap);
})()
,
// === 49. captp ./src/finalize.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let Far,isPrimitive;$h͏_imports([["@endo/pass-style", [["Far",[$h͏_a => (Far = $h͏_a)]],["isPrimitive",[$h͏_a => (isPrimitive = $h͏_a)]]]]]);


// @ts-check
const { WeakRef, FinalizationRegistry } = globalThis;

/**
 * @template K
 * @template {object} V
 * @typedef {Pick<Map<K, V>, 'get' | 'has' | 'delete'> &
 *  {
 *   set: (key: K, value: V) => void,
 *   clearWithoutFinalizing: () => void,
 *   getSize: () => number,
 * }} FinalizingMap
 */

/**
 *
 * Elsewhere this is known as a "Weak Value Map". Whereas a std JS WeakMap
 * is weak on its keys, this map is weak on its values. It does not retain these
 * values strongly. If a given value disappears, then the entries for it
 * disappear from every weak-value-map that holds it as a value.
 *
 * Just as a WeakMap only allows gc-able values as keys, a weak-value-map
 * only allows gc-able values as values.
 *
 * Unlike a WeakMap, a weak-value-map unavoidably exposes the non-determinism of
 * gc to its clients. Thus, both the ability to create one, as well as each
 * created one, must be treated as dangerous capabilities that must be closely
 * held. A program with access to these can read side channels though gc that do
 * not* rely on the ability to measure duration. This is a separate, and bad,
 * timing-independent side channel.
 *
 * This non-determinism also enables code to escape deterministic replay. In a
 * blockchain context, this could cause validators to differ from each other,
 * preventing consensus, and thus preventing chain progress.
 *
 * JS standards weakrefs have been carefully designed so that operations which
 * `deref()` a weakref cause that weakref to remain stable for the remainder of
 * that turn. The operations below guaranteed to do this derefing are `has`,
 * `get`, `set`, `delete`. Note that neither `clearWithoutFinalizing` nor
 * `getSize` are guaranteed to deref. Thus, a call to `map.getSize()` may
 * reflect values that might still be collected later in the same turn.
 *
 * @template K
 * @template {object} V
 * @param {(key: K) => void} [finalizer]
 * @param {object} [opts]
 * @param {boolean} [opts.weakValues]
 * @returns {FinalizingMap<K, V> &
 *  import('@endo/eventual-send').RemotableBrand<{}, FinalizingMap<K, V>>
 * }
 */
       const makeFinalizingMap = (finalizer, opts) => {
  const { weakValues = false } = opts || {};
  if (!weakValues || !WeakRef || !FinalizationRegistry) {
    /** @type Map<K, V> */
    const keyToVal = new Map();
    return Far('fakeFinalizingMap', {
      clearWithoutFinalizing: keyToVal.clear.bind(keyToVal),
      get: keyToVal.get.bind(keyToVal),
      has: keyToVal.has.bind(keyToVal),
      set: (key, val) => {
        keyToVal.set(key, val);
      },
      delete: keyToVal.delete.bind(keyToVal),
      getSize: () => keyToVal.size,
    });
  }
  /** @type Map<K, WeakRef<any>> */
  const keyToRef = new Map();
  const registry = new FinalizationRegistry(key => {
    // Because this will delete the current binding of `key`, we need to
    // be sure that it is not called because a previous binding was collected.
    // We do this with the `unregister` in `set` below, assuming that
    // `unregister` *immediately* suppresses the finalization of the thing
    // it unregisters. TODO If this is not actually guaranteed, i.e., if
    // finalizations that have, say, already been scheduled might still
    // happen after they've been unregistered, we will need to revisit this.
    // eslint-disable-next-line no-use-before-define
    finalizingMap.delete(key);
  });
  const finalizingMap = Far('finalizingMap', {
    /**
     * `clearWithoutFinalizing` does not `deref` anything, and so does not
     * suppress collection of the weakly-pointed-to values until the end of the
     * turn.  Because `clearWithoutFinalizing` immediately removes all entries
     * from this map, this possible collection is not observable using only this
     * map instance.  But it is observable via other uses of WeakRef or
     * FinalizationGroup, including other map instances made by this
     * `makeFinalizingMap`.
     */
    clearWithoutFinalizing: () => {
      for (const ref of keyToRef.values()) {
        registry.unregister(ref);
      }
      keyToRef.clear();
    },
    // Does deref, and thus does guarantee stability of the value until the
    // end of the turn.
    // UNTIL https://github.com/endojs/endo/issues/1514
    // Prefer: get: key => keyToRef.get(key)?.deref(),
    get: key => {
      const wr = keyToRef.get(key);
      if (!wr) {
        return wr;
      }
      return wr.deref();
    },
    has: key => finalizingMap.get(key) !== undefined,
    // Does deref, and thus does guarantee stability of both old and new values
    // until the end of the turn.
    set: (key, ref) => {
      assert(!isPrimitive(ref));
      finalizingMap.delete(key);
      const newWR = new WeakRef(ref);
      keyToRef.set(key, newWR);
      registry.register(ref, key, newWR);
    },
    delete: key => {
      const wr = keyToRef.get(key);
      if (!wr) {
        return false;
      }

      registry.unregister(wr);
      keyToRef.delete(key);

      // Our semantics are to finalize upon explicit `delete`, `set` (which
      // calls `delete`) or garbage collection (which also calls `delete`).
      // `clearWithoutFinalizing` is exempt.
      if (finalizer) {
        finalizer(key);
      }
      return true;
    },
    getSize: () => keyToRef.size,
  });
  return finalizingMap;
};$h͏_once.makeFinalizingMap(makeFinalizingMap);
})()
,
// === 50. captp ./src/captp.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Remotable,Far,makeMarshal,QCLASS,E,HandledPromise,isPromise,makePromiseKit,X,Fail,annotateError,makeTrap,makeFinalizingMap;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["Remotable",[$h͏_a => (Remotable = $h͏_a)]],["Far",[$h͏_a => (Far = $h͏_a)]],["makeMarshal",[$h͏_a => (makeMarshal = $h͏_a)]],["QCLASS",[$h͏_a => (QCLASS = $h͏_a)]]]],["@endo/eventual-send", [["E",[$h͏_a => (E = $h͏_a),$h͏_live["E"]]],["HandledPromise",[$h͏_a => (HandledPromise = $h͏_a)]]]],["@endo/promise-kit", [["isPromise",[$h͏_a => (isPromise = $h͏_a)]],["makePromiseKit",[$h͏_a => (makePromiseKit = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["annotateError",[$h͏_a => (annotateError = $h͏_a)]]]],["./trap.js", [["makeTrap",[$h͏_a => (makeTrap = $h͏_a)]]]],["./finalize.js", [["makeFinalizingMap",[$h͏_a => (makeFinalizingMap = $h͏_a)]]]]]);



















const WELL_KNOWN_SLOT_PROPERTIES = harden(['answerID', 'questionID', 'target']);

const sink = () => {};
harden(sink);

/**
 * @param {any} maybeThenable
 * @returns {boolean}
 */
const isThenable = maybeThenable =>
  maybeThenable && typeof maybeThenable.then === 'function';

/**
 * Reverse slot direction.
 *
 * Reversed to prevent namespace collisions between slots we
 * allocate and the ones the other side allocates.  If we allocate
 * a slot, serialize it to the other side, and they send it back to
 * us, we need to reference just our own slot, not one from their
 * side.
 *
 * @param {CapTPSlot} slot
 * @returns {CapTPSlot} slot with direction reversed
 */
const reverseSlot = slot => {
  const otherDir = slot[1] === '+' ? '-' : '+';
  const revslot = `${slot[0]}${otherDir}${slot.slice(2)}`;
  return revslot;
};

/**
 * @typedef {object} CapTPImportExportTables 
 * @property {(value: any) => CapTPSlot} makeSlotForValue
 * @property {(slot: CapTPSlot, iface: string | undefined) => any} makeValueForSlot
 * @property {(slot: CapTPSlot) => boolean} hasImport
 * @property {(slot: CapTPSlot) => any} getImport
 * @property {(slot: CapTPSlot, value: any) => void} markAsImported
 * @property {(slot: CapTPSlot) => boolean} hasExport
 * @property {(slot: CapTPSlot) => any} getExport
 * @property {(slot: CapTPSlot, value: any) => void} markAsExported
 * @property {(slot: CapTPSlot) => void} deleteExport
 * @property {() => void} didDisconnect
 
 * @typedef {object} MakeCapTPImportExportTablesOptions
 * @property {boolean} gcImports
 * @property {(slot: CapTPSlot) => void} releaseSlot
 * @property {(slot: CapTPSlot) => RemoteKit} makeRemoteKit
 
 * @param {MakeCapTPImportExportTablesOptions} options
 * @returns {CapTPImportExportTables}
 */
       const makeDefaultCapTPImportExportTables = ({
  gcImports,
  releaseSlot,
  makeRemoteKit,
}) => {
  /** @type {Map<CapTPSlot, any>} */
  const slotToExported = new Map();
  const slotToImported = makeFinalizingMap(
    /**
     * @param {CapTPSlot} slotID
     */
    slotID => {
      releaseSlot(slotID);
    },
    { weakValues: gcImports },
  );

  let lastExportID = 0;
  let lastPromiseID = 0;

  /**
   * Called when we have encountered a new value that needs to be assigned a slot.
   *
   * @param {any} val
   * @returns {CapTPSlot}
   */
  const makeSlotForValue = val => {
    /** @type {CapTPSlot} */
    let slot;
    if (isPromise(val)) {
      // This is a promise, so we're going to increment the lastPromiseID
      // and use that to construct the slot name.  Promise slots are prefaced
      // with 'p+'.
      lastPromiseID += 1;
      slot = `p+${lastPromiseID}`;
    } else {
      // Since this isn't a promise, we instead increment the lastExportId and
      // use that to construct the slot name.  Non-promises are prefaced with
      // 'o+' for normal objects.
      lastExportID += 1;
      slot = `o+${lastExportID}`;
    }
    return slot;
  };

  /**
   * Called when we have a new slot that needs to be made into a value.
   *
   * @param {CapTPSlot} slot
   * @param {string | undefined} iface
   * @returns {{val: any, settler: Settler }}
   */
  const makeValueForSlot = (slot, iface) => {
    let val;
    // Make a new handled promise for the slot.
    const { promise, settler } = makeRemoteKit(slot);
    if (slot[0] === 'o' || slot[0] === 't') {
      // A new remote presence
      // Use Remotable rather than Far to make a remote from a presence
      val = Remotable(iface, undefined, settler.resolveWithPresence());
    } else if (slot[0] === 'p') {
      val = promise;
    } else {
      Fail`Unknown slot type ${slot}`;
    }
    return { val, settler };
  };

  return {
    makeSlotForValue,
    makeValueForSlot,
    hasImport: slot => slotToImported.has(slot),
    getImport: slot => slotToImported.get(slot),
    markAsImported: (slot, val) => slotToImported.set(slot, val),
    hasExport: slot => slotToExported.has(slot),
    getExport: slot => slotToExported.get(slot),
    markAsExported: (slot, val) => slotToExported.set(slot, val),
    deleteExport: slot => slotToExported.delete(slot),
    didDisconnect: () => slotToImported.clearWithoutFinalizing(),
  };
};

/**
 * @typedef {object} CapTPOptions the options to makeCapTP
 * @property {(val: unknown, slot: CapTPSlot) => void} [exportHook]
 * @property {(val: unknown, slot: CapTPSlot) => void} [importHook]
 * @property {(err: any) => void} [onReject]
 * @property {number} [epoch] an integer tag to attach to all messages in order to
 * assist in ignoring earlier defunct instance's messages
 * @property {TrapGuest} [trapGuest] if specified, enable this CapTP (guest) to
 * use Trap(target) to block while the recipient (host) resolves and
 * communicates the response to the message
 * @property {TrapHost} [trapHost] if specified, enable this CapTP (host) to serve
 * objects marked with makeTrapHandler to synchronous clients (guests)
 * @property {boolean} [gcImports] if true, aggressively garbage collect imports
 * @property {(MakeCapTPImportExportTablesOptions) => CapTPImportExportTables} [makeCapTPImportExportTables] provide external import/export tables
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} rawSend send a JSONable packet
 * @param {any} bootstrapObj the object to export to the other side
 * @param {CapTPOptions} opts options to the connection
 */$h͏_once.makeDefaultCapTPImportExportTables(makeDefaultCapTPImportExportTables);
       const makeCapTP = (
  ourId,
  rawSend,
  bootstrapObj = undefined,
  opts = {},
) => {
  /** @type {Record<string, number>} */
  const sendStats = {};
  /** @type {Record<string, number>} */
  const recvStats = {};

  const gcStats = {
    DROPPED: 0,
  };
  const getStats = () =>
    harden({
      send: { ...sendStats },
      recv: { ...recvStats },
      gc: { ...gcStats },
    });

  const {
    onReject = err => console.error('CapTP', ourId, 'exception:', err),
    epoch = 0,
    exportHook,
    importHook,
    trapGuest,
    trapHost,
    gcImports = false,
    makeCapTPImportExportTables = makeDefaultCapTPImportExportTables,
  } = opts;

  // It's a hazard to have trapGuest and trapHost both enabled, as we may
  // encounter deadlock.  Without a lot more bookkeeping, we can't detect it for
  // more general networks of CapTPs, but we are conservative for at least this
  // one case.
  !(trapHost && trapGuest) ||
    Fail`CapTP ${ourId} can only be one of either trapGuest or trapHost`;

  const disconnectReason = id =>
    Error(`${JSON.stringify(id)} connection closed`);

  /** @type {Map<string, Promise<IteratorResult<void, void>>>} */
  const trapIteratorResultP = new Map();
  /** @type {Map<string, AsyncIterator<void, void, any>>} */
  const trapIterator = new Map();

  /** @type {any} */
  let unplug = false;
  const quietReject = (reason = undefined, returnIt = true) => {
    if ((unplug === false || reason !== unplug) && reason !== undefined) {
      onReject(reason);
    }
    if (!returnIt) {
      return Promise.resolve();
    }

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    const p = Promise.reject(reason);
    p.catch(sink);
    return p;
  };

  /**
   * @template T
   * @param {Map<T, number>} specimenToRefCount
   * @param {(specimen: T) => boolean} predicate
   */
  const makeRefCounter = (specimenToRefCount, predicate) => {
    /** @type {Set<T>} */
    const seen = new Set();

    return harden({
      /**
       * @param {T} specimen
       * @returns {T}
       */
      add(specimen) {
        if (predicate(specimen)) {
          seen.add(specimen);
        }
        return specimen;
      },
      commit() {
        // Increment the reference count for each seen specimen.
        for (const specimen of seen.keys()) {
          const numRefs = specimenToRefCount.get(specimen) || 0;
          specimenToRefCount.set(specimen, numRefs + 1);
        }
        seen.clear();
      },
      abort() {
        seen.clear();
      },
    });
  };

  /** @type {Map<CapTPSlot, number>} */
  const slotToNumRefs = new Map();

  const recvSlot = makeRefCounter(
    slotToNumRefs,
    slot => typeof slot === 'string' && slot[1] === '-',
  );

  const sendSlot = makeRefCounter(
    slotToNumRefs,
    slot => typeof slot === 'string' && slot[1] === '+',
  );

  /**
   * @param {Record<string, any>} obj
   */
  const send = obj => {
    sendStats[obj.type] = (sendStats[obj.type] || 0) + 1;

    for (const prop of WELL_KNOWN_SLOT_PROPERTIES) {
      sendSlot.add(obj[prop]);
    }
    sendSlot.commit();

    // Don't throw here if unplugged, just don't send.
    if (unplug !== false) {
      return;
    }

    // Actually send the message.
    Promise.resolve(rawSend(obj))
      // eslint-disable-next-line no-use-before-define
      .catch(abort); // Abort if rawSend returned a rejection.
  };

  /**
   * convertValToSlot and convertSlotToVal both perform side effects,
   * populating the c-lists (imports/exports/questions/answers) upon
   * marshalling/unmarshalling.  As we traverse the datastructure representing
   * the message, we discover what we need to import/export and send relevant
   * messages across the wire.
   */
  const { serialize, unserialize } = makeMarshal(
    // eslint-disable-next-line no-use-before-define
    convertValToSlot,
    // eslint-disable-next-line no-use-before-define
    convertSlotToVal,
    {
      marshalName: `captp:${ourId}`,
      // TODO Temporary hack.
      // See https://github.com/Agoric/agoric-sdk/issues/2780
      errorIdNum: 20000,
      // TODO: fix captp to be compatible with smallcaps
      serializeBodyFormat: 'capdata',
    },
  );

  /** @type {WeakMap<any, CapTPSlot>} */
  const valToSlot = new WeakMap(); // exports looked up by val
  const exportedTrapHandlers = new WeakSet();

  // Used to construct slot names for questions.
  // In this version of CapTP we use strings for export/import slot names.
  // prefixed with 'p' if promises, 'q' for questions, 'o' for objects,
  // and 't' for traps.;
  let lastQuestionID = 0;
  let lastTrapID = 0;

  /** @type {Map<CapTPSlot, Settler<unknown>>} */
  const settlers = new Map();
  /** @type {Map<string, any>} */
  const answers = new Map(); // chosen by our peer

  /**
   * @template [T=unknown]
   * @param {string} target
   * @returns {RemoteKit<T>}
   * Make a remote promise for `target` (an id in the questions table)
   */
  const makeRemoteKit = target => {
    /**
     * This handler is set up such that it will transform both
     * attribute access and method invocation of this remote promise
     * as also being questions / remote handled promises
     *
     * @type {import('@endo/eventual-send').EHandler<{}>}
     */
    const handler = {
      get(_o, prop) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          method: serialize(harden([prop])),
        });
        return promise;
      },
      applyFunction(_o, args) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          // @ts-expect-error Type 'unknown' is not assignable to type 'Passable<PassableCap, Error>'.
          method: serialize(harden([null, args])),
        });
        return promise;
      },
      applyMethod(_o, prop, args) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // Support: o~.[prop](...args) remote method invocation
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          // @ts-expect-error Type 'unknown' is not assignable to type 'Passable<PassableCap, Error>'.
          method: serialize(harden([prop, args])),
        });
        return promise;
      },
    };

    /** @type {Settler<T> | undefined} */
    let settler;

    /** @type {import('@endo/eventual-send').HandledExecutor<T>} */
    const executor = (resolve, reject, resolveWithPresence) => {
      const s = Far('settler', {
        resolve,
        reject,
        resolveWithPresence: () => resolveWithPresence(handler),
      });
      settler = s;
    };

    const promise = new HandledPromise(executor, handler);
    assert(settler);

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    promise.catch(e => quietReject(e, false));

    return harden({ promise, settler });
  };

  const releaseSlot = slotID => {
    // We drop all the references we know about at once, since GC told us we
    // don't need them anymore.
    const decRefs = slotToNumRefs.get(slotID) || 0;
    slotToNumRefs.delete(slotID);
    send({ type: 'CTP_DROP', slotID, decRefs, epoch });
  };

  const importExportTables = makeCapTPImportExportTables({
    gcImports,
    releaseSlot,
    // eslint-disable-next-line no-use-before-define
    makeRemoteKit,
  });

  /**
   * Called at marshalling time.  Either retrieves an existing export, or if
   * not yet exported, records this exported object.  If a promise, sets up a
   * promise listener to inform the other side when the promise is
   * fulfilled/broken.
   *
   * @type {import('@endo/marshal').ConvertValToSlot<CapTPSlot>}
   */
  function convertValToSlot(val) {
    if (!valToSlot.has(val)) {
      /** @type {CapTPSlot} */
      let slot;
      if (exportedTrapHandlers.has(val)) {
        lastTrapID += 1;
        slot = `t+${lastTrapID}`;
      } else {
        slot = importExportTables.makeSlotForValue(val);
      }
      if (exportHook) {
        exportHook(val, slot);
      }
      if (isPromise(val)) {
        // Set up promise listener to inform other side when this promise
        // is fulfilled/broken
        const promiseID = reverseSlot(slot);
        const resolved = result =>
          send({
            type: 'CTP_RESOLVE',
            promiseID,
            res: serialize(harden(result)),
          });
        const rejected = reason =>
          send({
            type: 'CTP_RESOLVE',
            promiseID,
            rej: serialize(harden(reason)),
          });
        E.when(
          val,
          resolved,
          rejected
          // Propagate internal errors as rejections.
        ).catch(rejected);
      }
      // Now record the export in both valToSlot and slotToVal so we can look it
      // up from either the value or the slot name later.
      valToSlot.set(val, slot);
      importExportTables.markAsExported(slot, val);
    }

    // At this point, the value is guaranteed to be exported, so return the
    // associated slot number.
    const slot = valToSlot.get(val);
    assert.typeof(slot, 'string');
    sendSlot.add(slot);

    return slot;
  }

  const IS_REMOTE_PUMPKIN = harden({});
  const assertValIsLocal = val => {
    const slot = valToSlot.get(val);
    if (slot && slot[1] === '-') {
      throw IS_REMOTE_PUMPKIN;
    }
  };

  const { serialize: assertOnlyLocal } = makeMarshal(assertValIsLocal);
  const isOnlyLocal = specimen => {
    // Try marshalling the object, but throw on references to remote objects.
    try {
      assertOnlyLocal(harden(specimen));
      return true;
    } catch (e) {
      if (e === IS_REMOTE_PUMPKIN) {
        return false;
      }
      throw e;
    }
  };

  /**
   * Generate a new question in the questions table and set up a new
   * remote handled promise.
   *
   * @returns {[CapTPSlot, Promise]}
   */
  const makeQuestion = () => {
    lastQuestionID += 1;
    const slotID = `q-${lastQuestionID}`;

    const { promise, settler } = makeRemoteKit(slotID);
    settlers.set(slotID, settler);

    // To fix #2846:
    // We return 'p' to the handler, and the eventual resolution of 'p' will
    // be used to resolve the caller's Promise, but the caller never sees 'p'
    // itself. The caller got back their Promise before the handler ever got
    // invoked, and thus before queueMessage was called. If that caller
    // passes the Promise they received as argument or return value, we want
    // it to serialize as resultVPID. And if someone passes resultVPID to
    // them, we want the user-level code to get back that Promise, not 'p'.
    valToSlot.set(promise, slotID);
    importExportTables.markAsImported(slotID, promise);

    return [sendSlot.add(slotID), promise];
  };

  /**
   * Set up import
   *
   * @type {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>}
   */
  function convertSlotToVal(theirSlot, iface = undefined) {
    const slot = reverseSlot(theirSlot);

    if (slot[1] === '+') {
      importExportTables.hasExport(slot) || Fail`Unknown export ${slot}`;
      return importExportTables.getExport(slot);
    }
    if (!importExportTables.hasImport(slot)) {
      if (iface === undefined) {
        iface = `Alleged: Presence ${ourId} ${slot}`;
      }
      const { val, settler } = importExportTables.makeValueForSlot(slot, iface);
      if (importHook) {
        importHook(val, slot);
      }
      if (slot[0] === 'p') {
        // A new promise
        settlers.set(slot, settler);
      }
      importExportTables.markAsImported(slot, val);
      valToSlot.set(val, slot);
    }

    // If we imported this slot, mark it as one our peer exported.
    recvSlot.add(slot);
    return importExportTables.getImport(slot);
  }

  // Message handler used for CapTP dispatcher
  const handler = {
    // Remote is asking for bootstrap object
    CTP_BOOTSTRAP(obj) {
      const { questionID } = obj;
      const bootstrap =
        typeof bootstrapObj === 'function' ? bootstrapObj(obj) : bootstrapObj;
      E.when(bootstrap, bs => {
        // console.log('sending bootstrap', bs);
        answers.set(questionID, bs);
        send({
          type: 'CTP_RETURN',
          epoch,
          answerID: questionID,
          result: serialize(bs),
        });
      });
    },
    CTP_DROP(obj) {
      const { slotID, decRefs = 0 } = obj;
      // Ensure we are decrementing one of our exports.
      slotID[1] === '-' || Fail`Cannot drop non-exported ${slotID}`;
      const slot = reverseSlot(slotID);

      const numRefs = slotToNumRefs.get(slot) || 0;
      const toDecr = Number(decRefs);
      if (numRefs > toDecr) {
        slotToNumRefs.set(slot, numRefs - toDecr);
      } else {
        // We are dropping the last known reference to this slot.
        gcStats.DROPPED += 1;
        slotToNumRefs.delete(slot);
        importExportTables.deleteExport(slot);
        answers.delete(slot);
      }
    },
    // Remote is invoking a method or retrieving a property.
    CTP_CALL(obj) {
      // questionId: Remote promise (for promise pipelining) this call is
      //   to fulfill
      // target: Slot id of the target to be invoked.  Checks against
      //   answers first; otherwise goes through unserializer
      const { questionID, target, trap } = obj;

      const [prop, args] = unserialize(obj.method);
      let val;
      if (answers.has(target)) {
        val = answers.get(target);
      } else {
        val = unserialize({
          body: JSON.stringify({
            [QCLASS]: 'slot',
            index: 0,
          }),
          slots: [target],
        });
      }

      /** @type {(isReject: boolean, value: any) => void} */
      let processResult = (isReject, value) => {
        // Serialize the result.
        let serial;
        try {
          serial = serialize(harden(value));
        } catch (error) {
          // Promote serialization errors to rejections.
          isReject = true;
          serial = serialize(harden(error));
        }

        send({
          type: 'CTP_RETURN',
          epoch,
          answerID: questionID,
          [isReject ? 'exception' : 'result']: serial,
        });
      };
      if (trap) {
        exportedTrapHandlers.has(val) ||
          Fail`Refused Trap(${val}) because target was not registered with makeTrapHandler`;
        assert.typeof(
          trapHost,
          'function',
          X`CapTP cannot answer Trap(${val}) without a trapHost function`,
        );

        // We need to create a promise for the "isDone" iteration right now to
        // prevent a race with the other side.
        const resultPK = makePromiseKit();
        trapIteratorResultP.set(questionID, resultPK.promise);

        processResult = (isReject, value) => {
          const serialized = serialize(harden(value));
          const ait = trapHost([isReject, serialized]);
          if (!ait) {
            // One-shot, no async iterator.
            resultPK.resolve({ done: true });
            return;
          }

          // We're ready for them to drive the iterator.
          trapIterator.set(questionID, ait);
          resultPK.resolve({ done: false });
        };
      }

      // If `args` is supplied, we're applying a method or function...
      // otherwise this is property access
      let hp;
      if (!args) {
        hp = HandledPromise.get(val, prop);
      } else if (prop === null) {
        hp = HandledPromise.applyFunction(val, args);
      } else {
        hp = HandledPromise.applyMethod(val, prop, args);
      }

      // Answer with our handled promise
      answers.set(questionID, hp);

      hp
        // Process this handled promise method's result when settled.
        .then(
          fulfilment => processResult(false, fulfilment),
          reason => processResult(true, reason),
        )
        // Propagate internal errors as rejections.
        .catch(reason => processResult(true, reason));
    },
    // Have the host serve more of the reply.
    CTP_TRAP_ITERATE: obj => {
      trapHost || Fail`CTP_TRAP_ITERATE is impossible without a trapHost`;
      const { questionID, serialized } = obj;

      const resultP = trapIteratorResultP.get(questionID);
      resultP || Fail`CTP_TRAP_ITERATE did not expect ${questionID}`;

      const [method, args] = unserialize(serialized);

      const getNextResultP = async () => {
        const result = await resultP;

        // Done with this trap iterator.
        const cleanup = () => {
          trapIterator.delete(questionID);
          trapIteratorResultP.delete(questionID);
          return harden({ done: true });
        };

        // We want to ensure we clean up the iterator in case of any failure.
        try {
          if (!result || result.done) {
            return cleanup();
          }

          const ait = trapIterator.get(questionID);
          if (!ait) {
            // The iterator is done, so we're done.
            return cleanup();
          }

          // Drive the next iteration.
          return await ait[method](...args);
        } catch (e) {
          cleanup();
          if (!e) {
            Fail`trapGuest expected trapHost AsyncIterator(${questionID}) to be done, but it wasn't`;
          }
          annotateError(e, X`trapHost AsyncIterator(${questionID}) threw`);
          throw e;
        }
      };

      // Store the next result promise.
      const nextResultP = getNextResultP();
      trapIteratorResultP.set(questionID, nextResultP);

      // Ensure that our caller handles any rejection.
      return nextResultP.then(sink);
    },
    // Answer to one of our questions.
    CTP_RETURN(obj) {
      const { result, exception, answerID } = obj;
      const settler = settlers.get(answerID);
      if (!settler) {
        throw Error(
          `Got an answer to a question we have not asked. (answerID = ${answerID} )`,
        );
      }
      settlers.delete(answerID);
      if ('exception' in obj) {
        settler.reject(unserialize(exception));
      } else {
        settler.resolve(unserialize(result));
      }
    },
    // Resolution to an imported promise
    CTP_RESOLVE(obj) {
      const { promiseID, res, rej } = obj;
      const settler = settlers.get(promiseID);
      if (!settler) {
        // Not a promise we know about; maybe it was collected?
        throw Error(
          `Got a resolvement of a promise we have not imported. (promiseID = ${promiseID} )`,
        );
      }
      settlers.delete(promiseID);
      if ('rej' in obj) {
        settler.reject(unserialize(rej));
      } else {
        settler.resolve(unserialize(res));
      }
    },
    // The other side has signaled something has gone wrong.
    // Pull the plug!
    CTP_DISCONNECT(obj) {
      const { reason = disconnectReason(ourId) } = obj;
      if (unplug === false) {
        // Reject with the original reason.
        quietReject(obj.reason, false);
        unplug = reason;
        // Deliver the object, even though we're unplugged.
        Promise.resolve(rawSend(obj)).catch(sink);
      }
      // We no longer wish to subscribe to object finalization.
      importExportTables.didDisconnect();
      for (const settler of settlers.values()) {
        settler.reject(reason);
      }
    },
  };

  // Get a reference to the other side's bootstrap object.
  const getBootstrap = async () => {
    if (unplug !== false) {
      return quietReject(unplug);
    }
    const [questionID, promise] = makeQuestion();
    send({
      type: 'CTP_BOOTSTRAP',
      epoch,
      questionID,
    });
    return harden(promise);
  };
  harden(handler);

  const validTypes = new Set(Object.keys(handler));
  for (const t of validTypes.keys()) {
    sendStats[t] = 0;
    recvStats[t] = 0;
  }

  // Return a dispatch function.
  const dispatch = obj => {
    try {
      validTypes.has(obj.type) || Fail`unknown message type ${obj.type}`;

      recvStats[obj.type] += 1;
      if (unplug !== false) {
        return false;
      }
      const fn = handler[obj.type];
      if (!fn) {
        return false;
      }

      for (const prop of WELL_KNOWN_SLOT_PROPERTIES) {
        recvSlot.add(obj[prop]);
      }
      fn(obj);
      recvSlot.commit();

      return true;
    } catch (e) {
      recvSlot.abort();
      quietReject(e, false);

      return false;
    }
  };

  // Abort a connection.
  /** @param {unknown} [reason] */
  const abort = reason => {
    dispatch({ type: 'CTP_DISCONNECT', epoch, reason });
  };

  const makeTrapHandler = (name, obj) => {
    const far = Far(name, obj);
    exportedTrapHandlers.add(far);
    return far;
  };

  // Put together our return value.
  const rets = {
    abort,
    dispatch,
    getBootstrap,
    getStats,
    isOnlyLocal,
    serialize,
    unserialize,
    makeTrapHandler,
    Trap: /** @type {import('./ts-types.js').Trap | undefined} */ (undefined),
    makeRemoteKit,
  };

  if (trapGuest) {
    assert.typeof(trapGuest, 'function', X`opts.trapGuest must be a function`);

    // Create the Trap proxy maker.
    const makeTrapImpl =
      implMethod =>
      (val, ...implArgs) => {
        Promise.resolve(val) !== val ||
          Fail`Trap(${val}) target cannot be a promise`;

        const slot = valToSlot.get(val);
        // TypeScript confused about `||` control flow so use `if` instead
        // https://github.com/microsoft/TypeScript/issues/50739
        if (!(slot && slot[1] === '-')) {
          Fail`Trap(${val}) target was not imported`;
        }
        // @ts-expect-error TypeScript confused by `Fail` too?
        slot[0] === 't' ||
          Fail`Trap(${val}) imported target was not created with makeTrapHandler`;

        // Send a "trap" message.
        lastQuestionID += 1;
        const questionID = `q-${lastQuestionID}`;

        // Encode the "method" parameter of the CTP_CALL.
        let method;
        switch (implMethod) {
          case 'get': {
            const [prop] = implArgs;
            method = serialize(harden([prop]));
            break;
          }
          case 'applyFunction': {
            const [args] = implArgs;
            method = serialize(harden([null, args]));
            break;
          }
          case 'applyMethod': {
            const [prop, args] = implArgs;
            method = serialize(harden([prop, args]));
            break;
          }
          default: {
            Fail`Internal error; unrecognized implMethod ${implMethod}`;
          }
        }

        // Set up the trap call with its identifying information and a way to send
        // messages over the current CapTP data channel.
        const [isException, serialized] = trapGuest({
          trapMethod: implMethod,
          // @ts-expect-error TypeScript confused by `Fail` too?
          slot,
          trapArgs: implArgs,
          startTrap: () => {
            // Send the call metadata over the connection.
            send({
              type: 'CTP_CALL',
              epoch,
              trap: true, // This is the magic marker.
              questionID,
              target: slot,
              method,
            });

            // Return an IterationObserver.
            const makeIteratorMethod =
              (iteratorMethod, done) =>
              (...args) => {
                send({
                  type: 'CTP_TRAP_ITERATE',
                  epoch,
                  questionID,
                  serialized: serialize(harden([iteratorMethod, args])),
                });
                return harden({ done, value: undefined });
              };
            return harden({
              next: makeIteratorMethod('next', false),
              return: makeIteratorMethod('return', true),
              throw: makeIteratorMethod('throw', true),
            });
          },
        });

        const value = unserialize(serialized);
        !isThenable(value) ||
          Fail`Trap(${val}) reply cannot be a Thenable; have ${value}`;

        if (isException) {
          throw value;
        }
        return value;
      };

    /** @type {TrapImpl} */
    const trapImpl = {
      applyFunction: makeTrapImpl('applyFunction'),
      applyMethod: makeTrapImpl('applyMethod'),
      get: makeTrapImpl('get'),
    };
    harden(trapImpl);

    rets.Trap = makeTrap(trapImpl);
  }

  return harden(rets);
};$h͏_once.makeCapTP(makeCapTP);
})()
,
// === 51. captp ./src/loopback.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Far,E,makeCapTP,nearTrapImpl,makeFinalizingMap;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["Far",[$h͏_a => (Far = $h͏_a)]]]],["./captp.js", [["E",[$h͏_a => (E = $h͏_a),$h͏_live["E"]]],["makeCapTP",[$h͏_a => (makeCapTP = $h͏_a)]]]],["./trap.js", [["nearTrapImpl",[$h͏_a => (nearTrapImpl = $h͏_a)]]]],["./finalize.js", [["makeFinalizingMap",[$h͏_a => (makeFinalizingMap = $h͏_a)]]]]]);







/** @import {ERef, EResult} from '@endo/eventual-send' */

/**
 * Create an async-isolated channel to an object.
 *
 * @param {string} ourId
 * @param {import('./captp.js').CapTPOptions} [nearOptions]
 * @param {import('./captp.js').CapTPOptions} [farOptions]
 * @returns {{
 *   makeFar<T>(x: T): Promise<EResult<T>>,
 *   makeNear<T>(x: T): Promise<EResult<T>>,
 *   makeTrapHandler<T>(name: string, x: T): T,
 *   isOnlyNear(x: any): boolean,
 *   isOnlyFar(x: any): boolean,
 *   getNearStats(): any,
 *   getFarStats(): any,
 *   Trap: Trap
 * }}
 */
       const makeLoopback = (ourId, nearOptions, farOptions) => {
  let lastNonce = 0;
  const nonceToRef = makeFinalizingMap();

  const bootstrap = Far('refGetter', {
    getRef(nonce) {
      // Find the local ref for the specified nonce.
      const xFar = nonceToRef.get(nonce);
      nonceToRef.delete(nonce);
      return xFar;
    },
  });

  const slotBody = JSON.stringify({
    '@qclass': 'slot',
    index: 0,
  });

  // Create the tunnel.
  const {
    Trap,
    dispatch: nearDispatch,
    getBootstrap: getFarBootstrap,
    getStats: getNearStats,
    isOnlyLocal: isOnlyNear
    // eslint-disable-next-line no-use-before-define
  } = makeCapTP(`near-${ourId}`, o => farDispatch(o), bootstrap, {
    trapGuest: ({ trapMethod, slot, trapArgs }) => {
      let value;
      let isException = false;
      try {
        // Cross the boundary to pull out the far object.
        // eslint-disable-next-line no-use-before-define
        const far = farUnserialize({ body: slotBody, slots: [slot] });
        value = nearTrapImpl[trapMethod](far, trapArgs[0], trapArgs[1]);
      } catch (e) {
        isException = true;
        value = e;
      }
      harden(value);
      // eslint-disable-next-line no-use-before-define
      return [isException, farSerialize(value)];
    },
    ...nearOptions,
  });
  assert(Trap);

  const {
    makeTrapHandler,
    dispatch: farDispatch,
    getBootstrap: getNearBootstrap,
    getStats: getFarStats,
    isOnlyLocal: isOnlyFar,
    unserialize: farUnserialize,
    serialize: farSerialize,
  } = makeCapTP(`far-${ourId}`, nearDispatch, bootstrap, farOptions);

  const farGetter = getFarBootstrap();
  const nearGetter = getNearBootstrap();

  /**
   * @template T
   * @param {ERef<{ getRef(nonce: number): T }>} refGetter
   */
  const makeRefMaker =
    refGetter =>
    /**
     * @param {T} x
     * @returns {Promise<EResult<T>>}
     */
    async x => {
      lastNonce += 1;
      const myNonce = lastNonce;
      const val = await x;
      nonceToRef.set(myNonce, harden(val));
      // @ts-expect-error Type 'T | Awaited<T>' is not assignable to type 'EResult<T>'
      return E(refGetter).getRef(myNonce);
    };

  return {
    makeFar: makeRefMaker(farGetter),
    makeNear: makeRefMaker(nearGetter),
    isOnlyNear,
    isOnlyFar,
    getNearStats,
    getFarStats,
    makeTrapHandler,
    Trap,
  };
};$h͏_once.makeLoopback(makeLoopback);
})()
,
// === 52. captp ./src/atomics.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,X,Fail;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]]]);


// This is a pathological minimum, but exercised by the unit test.
       const MIN_DATA_BUFFER_LENGTH = 1;

// Calculate how big the transfer buffer needs to be.
$h͏_once.MIN_DATA_BUFFER_LENGTH(MIN_DATA_BUFFER_LENGTH);const TRANSFER_OVERHEAD_LENGTH=
  BigUint64Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT;$h͏_once.TRANSFER_OVERHEAD_LENGTH(TRANSFER_OVERHEAD_LENGTH);
       const MIN_TRANSFER_BUFFER_LENGTH =
  MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH;

// These are bit flags for the status element of the transfer buffer.
$h͏_once.MIN_TRANSFER_BUFFER_LENGTH(MIN_TRANSFER_BUFFER_LENGTH);const STATUS_WAITING=1;
const STATUS_FLAG_DONE = 2;
const STATUS_FLAG_REJECT = 4;

/**
 * Return a status buffer, length buffer, and data buffer backed by transferBuffer.
 *
 * @param {SharedArrayBuffer} transferBuffer the backing buffer
 */
const splitTransferBuffer = transferBuffer => {
  transferBuffer.byteLength >= MIN_TRANSFER_BUFFER_LENGTH ||
    Fail`Transfer buffer of ${transferBuffer.byteLength} bytes is smaller than MIN_TRANSFER_BUFFER_LENGTH ${MIN_TRANSFER_BUFFER_LENGTH}`;
  const lenbuf = new BigUint64Array(transferBuffer, 0, 1);

  // The documentation says that this needs to be an Int32Array for use with
  // Atomics.notify:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/notify#syntax
  const statusbuf = new Int32Array(transferBuffer, lenbuf.byteLength, 1);
  const overheadLength = lenbuf.byteLength + statusbuf.byteLength;
  assert.equal(
    overheadLength,
    TRANSFER_OVERHEAD_LENGTH,
    X`Internal error; actual overhead ${overheadLength} of bytes is not TRANSFER_OVERHEAD_LENGTH ${TRANSFER_OVERHEAD_LENGTH}`,
  );
  const databuf = new Uint8Array(transferBuffer, overheadLength);
  databuf.byteLength >= MIN_DATA_BUFFER_LENGTH ||
    Fail`Transfer buffer of size ${transferBuffer.byteLength} only supports ${databuf.byteLength} data bytes; need at least ${MIN_DATA_BUFFER_LENGTH}`;
  return harden({ statusbuf, lenbuf, databuf });
};

/**
 * Create a trapHost that can be paired with makeAtomicsTrapGuest.
 *
 * This host encodes the transfer buffer and returns it in consecutive slices
 * when the guest iterates over it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {import('./types.js').TrapHost}
 */
       const makeAtomicsTrapHost = transferBuffer => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  const te = new TextEncoder();

  return harden(async function* trapHost([isReject, serialized]) {
    // Get the complete encoded message buffer.
    const json = JSON.stringify(serialized);
    const encoded = te.encode(json);

    // Send chunks in the data transfer buffer.
    let i = 0;
    let done = false;
    while (!done) {
      // Copy the next slice of the encoded arry to the data buffer.
      const subenc = encoded.subarray(i, i + databuf.length);
      databuf.set(subenc);

      // Save the length of the remaining data.
      const remaining = BigInt(encoded.length - i);
      lenbuf[0] = remaining;

      // Calculate the next slice, and whether this is the last one.
      i += subenc.length;
      done = i >= encoded.length;

      // Find bitflags to represent the rejected and finished state.
      const rejectFlag = isReject ? STATUS_FLAG_REJECT : 0;
      const doneFlag = done ? STATUS_FLAG_DONE : 0;

      // Notify our guest for this data buffer.

      // eslint-disable-next-line no-bitwise
      statusbuf[0] = rejectFlag | doneFlag;
      Atomics.notify(statusbuf, 0, +Infinity);

      if (!done) {
        // Wait until the next call to `it.next()`.  If the guest calls
        // `it.return()` or `it.throw()`, then this yield will return or throw,
        // terminating the generator function early.
        yield;
      }
    }
  });
};

/**
 * Create a trapGuest that can be paired with makeAtomicsTrapHost.
 *
 * This guest iterates through the consecutive slices of the JSON-encoded data,
 * then returns it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {import('./types.js').TrapGuest}
 */$h͏_once.makeAtomicsTrapHost(makeAtomicsTrapHost);
       const makeAtomicsTrapGuest = transferBuffer => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  return ({ startTrap }) => {
    // Start by sending the trap call to the host.
    const it = startTrap();

    /** @type {Uint8Array | undefined} */
    let encoded;
    let i = 0;
    let done = false;
    while (!done) {
      // Tell that we are ready for another buffer.
      statusbuf[0] = STATUS_WAITING;
      const { done: itDone } = it.next();
      !itDone || Fail`Internal error; it.next() returned done=${itDone}`;

      // Wait for the host to wake us.
      Atomics.wait(statusbuf, 0, STATUS_WAITING);

      // Determine whether this is the last buffer.
      // eslint-disable-next-line no-bitwise
      done = (statusbuf[0] & STATUS_FLAG_DONE) !== 0;

      // Accumulate the encoded buffer.
      const remaining = Number(lenbuf[0]);
      const datalen = Math.min(remaining, databuf.byteLength);
      if (!encoded) {
        if (done) {
          // Special case: we are done on first try, so we don't need to copy
          // anything.
          encoded = databuf.subarray(0, datalen);
          break;
        }
        // Allocate our buffer for the remaining data.
        encoded = new Uint8Array(remaining);
      }

      // Copy the next buffer.
      encoded.set(databuf.subarray(0, datalen), i);
      i += datalen;
    }

    // This throw is harmless if the host iterator has already finished, and
    // if not finished, captp will correctly raise an error.
    //
    // TODO: It would be nice to use an error type, but captp is just too
    // noisy with spurious "Temporary logging of sent error" messages.
    // it.throw(makeError(X`Trap host has not finished`));
    it.throw(null);

    // eslint-disable-next-line no-bitwise
    const isReject = !!(statusbuf[0] & STATUS_FLAG_REJECT);

    // Decode the accumulated encoded buffer.
    const td = new TextDecoder('utf-8');
    const json = td.decode(encoded);

    // Parse the JSON data into marshalled form.
    const serialized = JSON.parse(json);
    return [isReject, serialized];
  };
};$h͏_once.makeAtomicsTrapGuest(makeAtomicsTrapGuest);
})()
,
// === 53. captp ./src/index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["@endo/nat", []],["@endo/marshal", []],["./captp.js", []],["./loopback.js", []],["./atomics.js", []]]);
})()
,
// === 54. far ./src/exports.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 55. far ./src/index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["@endo/eventual-send", []],["@endo/pass-style", []],["./exports.js", []]]);
})()
,
// === 56. patterns ./src/keys/copySet.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,hideAndHardenFunction,makeTagged,passStyleOf,compareAntiRank,isRankSorted,makeFullOrderComparatorKit,sortByRank;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/marshal", [["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["isRankSorted",[$h͏_a => (isRankSorted = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]]]);










/// <reference types="ses"/>

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable} from '@endo/pass-style';
 * @import {FullCompare} from '@endo/marshal';
 * @import {CopySet, Key} from '../types.js';
 */

/**
 * @template {Passable} T
 * @param {T[]} elements
 * @param {FullCompare | undefined} fullCompare If provided and `elements` is already known
 * to be sorted by this `fullCompare`, then we should get a memo hit rather
 * than a resorting. However, currently, we still enumerate the entire array
 * each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmNoDuplicates = (elements, fullCompare, reject) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  // TODO Once all our tooling is ready for `&&=`, the following
  // line should be rewritten using it.
  fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;

  elements = sortByRank(elements, fullCompare);
  const { length } = elements;
  for (let i = 1; i < length; i += 1) {
    const k0 = elements[i - 1];
    const k1 = elements[i];
    if (fullCompare(k0, k1) === 0) {
      return reject && reject`value has duplicate keys: ${k0}`;
    }
  }
  return true;
};

/**
 * @template {Passable} T
 * @param {T[]} elements
 * @param {FullCompare} [fullCompare]
 * @returns {void}
 */
       const assertNoDuplicates = (elements, fullCompare = undefined) => {
  confirmNoDuplicates(elements, fullCompare, Fail);
};

/**
 * @param {Passable[]} elements
 * @param {Rejector} reject
 * @returns {boolean}
 */$h͏_once.assertNoDuplicates(assertNoDuplicates);
       const confirmElements = (elements, reject) => {
  if (passStyleOf(elements) !== 'copyArray') {
    return (
      reject &&
      reject`The keys of a copySet or copyMap must be a copyArray: ${elements}`
    );
  }
  if (!isRankSorted(elements, compareAntiRank)) {
    return (
      reject &&
      reject`The keys of a copySet or copyMap must be sorted in reverse rank order: ${elements}`
    );
  }
  return confirmNoDuplicates(elements, undefined, reject);
};$h͏_once.confirmElements(confirmElements);
harden(confirmElements);

       const assertElements = elements => {
  confirmElements(elements, Fail);
};$h͏_once.assertElements(assertElements);
hideAndHardenFunction(assertElements);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementsList
 */
       const coerceToElements = elementsList => {
  const elements = sortByRank(elementsList, compareAntiRank);
  assertElements(elements);
  return elements;
};$h͏_once.coerceToElements(coerceToElements);
harden(coerceToElements);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopySet<K>}
 */
       const makeSetOfElements = elementIter =>
  makeTagged('copySet', coerceToElements(elementIter));$h͏_once.makeSetOfElements(makeSetOfElements);
harden(makeSetOfElements);
})()
,
// === 57. patterns ./src/keys/copyBag.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,hideAndHardenFunction,makeTagged,passStyleOf,compareAntiRank,isRankSorted,makeFullOrderComparatorKit,sortByRank;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/marshal", [["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["isRankSorted",[$h͏_a => (isRankSorted = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]]]);










/// <reference types="ses"/>

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable} from '@endo/pass-style';
 * @import {FullCompare} from '@endo/marshal';
 * @import {CopyBag, Key} from '../types.js';
 */

/**
 * @template {Key} T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare | undefined} fullCompare If provided and `bagEntries` is already
 * known to be sorted by this `fullCompare`, then we should get a memo hit
 * rather than a resorting. However, currently, we still enumerate the entire
 * array each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate-keys finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmNoDuplicateKeys = (bagEntries, fullCompare, reject) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  // TODO Once all our tooling is ready for `&&=`, the following
  // line should be rewritten using it.
  fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;

  // Since the key is more significant than the value (the count),
  // sorting by fullOrder is guaranteed to make duplicate keys
  // adjacent independent of their counts.
  bagEntries = sortByRank(bagEntries, fullCompare);
  const { length } = bagEntries;
  for (let i = 1; i < length; i += 1) {
    const k0 = bagEntries[i - 1][0];
    const k1 = bagEntries[i][0];
    if (fullCompare(k0, k1) === 0) {
      return reject && reject`value has duplicate keys: ${k0}`;
    }
  }
  return true;
};

/**
 * @template {Key} T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare} [fullCompare]
 * @returns {void}
 */
       const assertNoDuplicateKeys = (bagEntries, fullCompare = undefined) => {
  confirmNoDuplicateKeys(bagEntries, fullCompare, Fail);
};

/**
 * @param {[Passable,bigint][]} bagEntries
 * @param {Rejector} reject
 * @returns {boolean}
 */$h͏_once.assertNoDuplicateKeys(assertNoDuplicateKeys);
       const confirmBagEntries = (bagEntries, reject) => {
  if (passStyleOf(bagEntries) !== 'copyArray') {
    return (
      reject &&
      reject`The entries of a copyBag must be a copyArray: ${bagEntries}`
    );
  }
  if (!isRankSorted(bagEntries, compareAntiRank)) {
    return (
      reject &&
      reject`The entries of a copyBag must be sorted in reverse rank order: ${bagEntries}`
    );
  }
  for (const entry of bagEntries) {
    if (
      passStyleOf(entry) !== 'copyArray' ||
      entry.length !== 2 ||
      typeof entry[1] !== 'bigint'
    ) {
      return (
        reject &&
        reject`Each entry of a copyBag must be pair of a key and a bigint representing a count: ${entry}`
      );
    }
    if (entry[1] < 1) {
      return (
        reject &&
        reject`Each entry of a copyBag must have a positive count: ${entry}`
      );
    }
  }
  // @ts-expect-error XXX Key types
  return confirmNoDuplicateKeys(bagEntries, undefined, reject);
};$h͏_once.confirmBagEntries(confirmBagEntries);
harden(confirmBagEntries);

// eslint-disable-next-line jsdoc/require-returns-check -- doesn't understand asserts
/**
 * @param {[Passable,bigint][]} bagEntries
 * @returns {asserts bagEntries is [Passable,bigint][]}
 */
       const assertBagEntries = bagEntries => {
  confirmBagEntries(bagEntries, Fail);
};$h͏_once.assertBagEntries(assertBagEntries);
hideAndHardenFunction(assertBagEntries);

/**
 * @template {Key} K
 * @param {Iterable<[K, bigint]>} bagEntriesList
 */
       const coerceToBagEntries = bagEntriesList => {
  const bagEntries = sortByRank(bagEntriesList, compareAntiRank);
  assertBagEntries(bagEntries);
  return bagEntries;
};$h͏_once.coerceToBagEntries(coerceToBagEntries);
harden(coerceToBagEntries);

/**
 * @template {Key} K
 * @param {Iterable<[K, bigint]>} bagEntryIter
 * @returns {CopyBag<K>}
 */
       const makeBagOfEntries = bagEntryIter =>
  makeTagged('copyBag', coerceToBagEntries(bagEntryIter));$h͏_once.makeBagOfEntries(makeBagOfEntries);
harden(makeBagOfEntries);
})()
,
// === 58. patterns ./src/keys/checkKey.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,Fail,q,hideAndHardenFunction,Far,getTag,makeTagged,passStyleOf,isAtom,compareAntiRank,makeFullOrderComparatorKit,sortByRank,confirmElements,makeSetOfElements,confirmBagEntries,makeBagOfEntries;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/pass-style", [["Far",[$h͏_a => (Far = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]],["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["isAtom",[$h͏_a => (isAtom = $h͏_a)]]]],["@endo/marshal", [["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]],["./copySet.js", [["confirmElements",[$h͏_a => (confirmElements = $h͏_a)]],["makeSetOfElements",[$h͏_a => (makeSetOfElements = $h͏_a)]]]],["./copyBag.js", [["confirmBagEntries",[$h͏_a => (confirmBagEntries = $h͏_a)]],["makeBagOfEntries",[$h͏_a => (makeBagOfEntries = $h͏_a)]]]]]);











const { ownKeys } = Reflect;

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable, Atom} from '@endo/pass-style';
 * @import {CopyBag, CopyMap, CopySet, Key, ScalarKey} from '../types.js';
 */

// ////////////////// Atom and Scalar keys ////////////////////////////////

/**
 * @param {any} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmScalarKey = (val, reject) => {
  if (isAtom(val)) {
    return true;
  }
  const passStyle = passStyleOf(val);
  if (passStyle === 'remotable') {
    return true;
  }
  return reject && reject`A ${q(passStyle)} cannot be a scalar key: ${val}`;
};

/**
 * @param {any} val
 * @returns {val is ScalarKey}
 */$h͏_once.confirmScalarKey(confirmScalarKey);
       const isScalarKey = val => confirmScalarKey(val, false);$h͏_once.isScalarKey(isScalarKey);
hideAndHardenFunction(isScalarKey);

/**
 * @param {Passable} val
 * @returns {asserts val is ScalarKey}
 */
       const assertScalarKey = val => {
  confirmScalarKey(val, Fail);
};$h͏_once.assertScalarKey(assertScalarKey);
hideAndHardenFunction(assertScalarKey);

// ////////////////////////////// Keys /////////////////////////////////////////

// @ts-expect-error Key does not satisfy WeakKey
/** @type {WeakSet<Key>} */
// @ts-expect-error Key does not satisfy WeakKey
const keyMemo = new WeakSet();

/**
 * @param {unknown} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmKey = (val, reject) => {
  if (isAtom(val)) {
    return true;
  }
  // @ts-expect-error narrowed
  if (keyMemo.has(val)) {
    return true;
  }
  // eslint-disable-next-line no-use-before-define
  const result = confirmKeyInternal(val, reject);
  if (result) {
    // Don't cache the undefined cases, so that if it is tried again
    // with `Fail` it'll throw a diagnostic again
    // @ts-expect-error narrowed
    keyMemo.add(val);
  }
  // Note that we must not memoize a negative judgement, so that if it is tried
  // again with `Fail`, it will still produce a useful diagnostic.
  return result;
};$h͏_once.confirmKey(confirmKey);
harden(confirmKey);

/**
 * @type {{
 *   (val: Passable): val is Key;
 *   (val: any): boolean;
 * }}
 */
       const isKey = val => confirmKey(val, false);$h͏_once.isKey(isKey);
hideAndHardenFunction(isKey);

/**
 * @param {Key} val
 * @returns {asserts val is Key}
 */
       const assertKey = val => {
  confirmKey(val, Fail);
};$h͏_once.assertKey(assertKey);
hideAndHardenFunction(assertKey);

// //////////////////////////// CopySet ////////////////////////////////////////

// Moved to here so they can check that the copySet contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopySet>} */
const copySetMemo = new WeakSet();

/**
 * @param {any} s
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmCopySet = (s, reject) => {
  if (copySetMemo.has(s)) {
    return true;
  }
  const result =
    ((passStyleOf(s) === 'tagged' && getTag(s) === 'copySet') ||
      (reject && reject`Not a copySet: ${s}`)) &&
    confirmElements(s.payload, reject) &&
    confirmKey(s.payload, reject);
  if (result) {
    copySetMemo.add(s);
  }
  return result;
};$h͏_once.confirmCopySet(confirmCopySet);
harden(confirmCopySet);

/**
 * @param {any} s
 * @returns {s is CopySet}
 */
       const isCopySet = s => confirmCopySet(s, false);$h͏_once.isCopySet(isCopySet);
hideAndHardenFunction(isCopySet);

/**
 * @callback AssertCopySet
 * @param {Passable} s
 * @returns {asserts s is CopySet}
 */

/** @type {AssertCopySet} */
       const assertCopySet = s => {
  confirmCopySet(s, Fail);
};$h͏_once.assertCopySet(assertCopySet);
hideAndHardenFunction(assertCopySet);

/**
 * @template {Key} K
 * @param {CopySet<K>} s
 * @returns {K[]}
 */
       const getCopySetKeys = s => {
  assertCopySet(s);
  return s.payload;
};$h͏_once.getCopySetKeys(getCopySetKeys);
harden(getCopySetKeys);

/**
 * @template {Key} K
 * @param {CopySet<K>} s
 * @param {(key: K, index: number) => boolean} fn
 * @returns {boolean}
 */
       const everyCopySetKey = (s, fn) =>
  getCopySetKeys(s).every((key, index) => fn(key, index));$h͏_once.everyCopySetKey(everyCopySetKey);
harden(everyCopySetKey);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopySet<K>}
 */
       const makeCopySet = elementIter => {
  const result = makeSetOfElements(elementIter);
  assertCopySet(result);
  return result;
};$h͏_once.makeCopySet(makeCopySet);
harden(makeCopySet);

// //////////////////////////// CopyBag ////////////////////////////////////////

// Moved to here so they can check that the copyBag contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopyBag>} */
const copyBagMemo = new WeakSet();

/**
 * @param {any} b
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmCopyBag = (b, reject) => {
  if (copyBagMemo.has(b)) {
    return true;
  }
  const result =
    ((passStyleOf(b) === 'tagged' && getTag(b) === 'copyBag') ||
      (reject && reject`Not a copyBag: ${b}`)) &&
    confirmBagEntries(b.payload, reject) &&
    confirmKey(b.payload, reject);
  if (result) {
    copyBagMemo.add(b);
  }
  return result;
};$h͏_once.confirmCopyBag(confirmCopyBag);
harden(confirmCopyBag);

/**
 * @param {any} b
 * @returns {b is CopyBag}
 */
       const isCopyBag = b => confirmCopyBag(b, false);$h͏_once.isCopyBag(isCopyBag);
hideAndHardenFunction(isCopyBag);

/**
 * @callback AssertCopyBag
 * @param {Passable} b
 * @returns {asserts b is CopyBag}
 */

/** @type {AssertCopyBag} */
       const assertCopyBag = b => {
  confirmCopyBag(b, Fail);
};$h͏_once.assertCopyBag(assertCopyBag);
hideAndHardenFunction(assertCopyBag);

/**
 * @template {Key} K
 * @param {CopyBag<K>} b
 * @returns {CopyBag<K>['payload']}
 */
       const getCopyBagEntries = b => {
  assertCopyBag(b);
  return b.payload;
};$h͏_once.getCopyBagEntries(getCopyBagEntries);
harden(getCopyBagEntries);

/**
 * @template {Key} K
 * @param {CopyBag<K>} b
 * @param {(entry: [K, bigint], index: number) => boolean} fn
 * @returns {boolean}
 */
       const everyCopyBagEntry = (b, fn) =>
  getCopyBagEntries(b).every((entry, index) => fn(entry, index));$h͏_once.everyCopyBagEntry(everyCopyBagEntry);
harden(everyCopyBagEntry);

/**
 * @template {Key} K
 * @param {Iterable<[K,bigint]>} bagEntryIter
 * @returns {CopyBag<K>}
 */
       const makeCopyBag = bagEntryIter => {
  const result = makeBagOfEntries(bagEntryIter);
  assertCopyBag(result);
  return result;
};$h͏_once.makeCopyBag(makeCopyBag);
harden(makeCopyBag);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopyBag<K>}
 */
       const makeCopyBagFromElements = elementIter => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;
  const sorted = sortByRank(elementIter, fullCompare);
  /** @type {[K,bigint][]} */
  const entries = [];
  for (let i = 0; i < sorted.length; ) {
    const k = sorted[i];
    let j = i + 1;
    while (j < sorted.length && fullCompare(k, sorted[j]) === 0) {
      j += 1;
    }
    entries.push([k, BigInt(j - i)]);
    i = j;
  }
  return makeCopyBag(entries);
};$h͏_once.makeCopyBagFromElements(makeCopyBagFromElements);
harden(makeCopyBagFromElements);

// //////////////////////////// CopyMap ////////////////////////////////////////

// Moved to here so they can check that the copyMap's keys contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopyMap>} */
const copyMapMemo = new WeakSet();

/**
 * @param {any} m
 * @param {Rejector} reject
 * @returns {boolean}
 */
       const confirmCopyMap = (m, reject) => {
  if (copyMapMemo.has(m)) {
    return true;
  }
  if (!(passStyleOf(m) === 'tagged' && getTag(m) === 'copyMap')) {
    return reject && reject`Not a copyMap: ${m}`;
  }
  const { payload } = m;
  if (passStyleOf(payload) !== 'copyRecord') {
    return reject && reject`A copyMap's payload must be a record: ${m}`;
  }
  const { keys, values, ...rest } = payload;
  const result =
    (ownKeys(rest).length === 0 ||
      (reject &&
        reject`A copyMap's payload must only have .keys and .values: ${m}`)) &&
    confirmElements(keys, reject) &&
    confirmKey(keys, reject) &&
    (passStyleOf(values) === 'copyArray' ||
      (reject && reject`A copyMap's .values must be a copyArray: ${m}`)) &&
    (keys.length === values.length ||
      (reject &&
        reject`A copyMap must have the same number of keys and values: ${m}`));
  if (result) {
    copyMapMemo.add(m);
  }
  return result;
};$h͏_once.confirmCopyMap(confirmCopyMap);
harden(confirmCopyMap);

/**
 * @param {any} m
 * @returns {m is CopyMap<Key, Passable>}
 */
       const isCopyMap = m => confirmCopyMap(m, false);$h͏_once.isCopyMap(isCopyMap);
hideAndHardenFunction(isCopyMap);

/**
 * @param {Passable} m
 * @returns {asserts m is CopyMap<Key, Passable>}
 */
       const assertCopyMap = m => {
  confirmCopyMap(m, Fail);
};$h͏_once.assertCopyMap(assertCopyMap);
hideAndHardenFunction(assertCopyMap);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {K[]}
 */
       const getCopyMapKeys = m => {
  assertCopyMap(m);
  return m.payload.keys;
};$h͏_once.getCopyMapKeys(getCopyMapKeys);
harden(getCopyMapKeys);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {V[]}
 */
       const getCopyMapValues = m => {
  assertCopyMap(m);
  return m.payload.values;
};$h͏_once.getCopyMapValues(getCopyMapValues);
harden(getCopyMapValues);

/**
 * Returns an array of a CopyMap's entries in storage order.
 *
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {Array<[K,V]>}
 */
       const getCopyMapEntryArray = m => {
  assertCopyMap(m);
  const {
    payload: { keys, values },
  } = m;
  return harden(keys.map((key, i) => [key, values[i]]));
};$h͏_once.getCopyMapEntryArray(getCopyMapEntryArray);
harden(getCopyMapEntryArray);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {Iterable<[K,V]>}
 */
       const getCopyMapEntries = m => {
  assertCopyMap(m);
  const {
    payload: { keys, values },
  } = m;
  const { length } = /** @type {Array} */ (keys);
  return Far('CopyMap entries iterable', {
    [Symbol.iterator]: () => {
      let i = 0;
      return Far('CopyMap entries iterator', {
        next: () => {
          /** @type {IteratorResult<[K,V],void>} */
          let result;
          if (i < length) {
            result = harden({ done: false, value: [keys[i], values[i]] });
            i += 1;
            return result;
          } else {
            result = harden({ done: true, value: undefined });
          }
          return result;
        },
      });
    },
  });
};$h͏_once.getCopyMapEntries(getCopyMapEntries);
harden(getCopyMapEntries);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @param {(key: K, index: number) => boolean} fn
 * @returns {boolean}
 */
       const everyCopyMapKey = (m, fn) =>
  getCopyMapKeys(m).every((key, index) => fn(key, index));$h͏_once.everyCopyMapKey(everyCopyMapKey);
harden(everyCopyMapKey);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @param {(value: V, index: number) => boolean} fn
 * @returns {boolean}
 */
       const everyCopyMapValue = (m, fn) =>
  getCopyMapValues(m).every((value, index) => fn(value, index));$h͏_once.everyCopyMapValue(everyCopyMapValue);
harden(everyCopyMapValue);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {CopySet<K>}
 */
       const copyMapKeySet = m =>
  // A copyMap's keys are already in the internal form used by copySets.
  makeTagged('copySet', m.payload.keys);$h͏_once.copyMapKeySet(copyMapKeySet);
harden(copyMapKeySet);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {Iterable<[K, V]>} entries
 * @returns {CopyMap<K,V>}
 */
       const makeCopyMap = entries => {
  // This is weird, but reverse rank sorting the entries is a good first step
  // for getting the rank sorted keys together with the values
  // organized by those keys. Also, among values associated with
  // keys in the same equivalence class, those are rank sorted.
  // TODO This
  // could solve the copyMap cover issue explained in patternMatchers.js.
  // But only if we include this criteria in our validation of copyMaps,
  // which we currently do not.
  const sortedEntries = sortByRank(entries, compareAntiRank);
  const keys = sortedEntries.map(([k, _v]) => k);
  const values = sortedEntries.map(([_k, v]) => v);
  const result = makeTagged('copyMap', { keys, values });
  assertCopyMap(result);
  return result;
};$h͏_once.makeCopyMap(makeCopyMap);
harden(makeCopyMap);

// //////////////////////// Keys Recur /////////////////////////////////////////

/**
 * `confirmKeyInternal` is only called if `val` is Passable but is not an Atom.
 *
 * @param {any} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmKeyInternal = (val, reject) => {
  const checkIt = child => confirmKey(child, reject);

  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'remotable': {
      // A remotable is a ScalarKey but not an Atom, so we pick it up here.
      return true;
    }
    case 'copyRecord': {
      // A copyRecord is a key iff all its children are keys
      return Object.values(val).every(checkIt);
    }
    case 'copyArray': {
      // A copyArray is a key iff all its children are keys
      return val.every(checkIt);
    }
    case 'tagged': {
      const tag = getTag(val);
      switch (tag) {
        case 'copySet': {
          return confirmCopySet(val, reject);
        }
        case 'copyBag': {
          return confirmCopyBag(val, reject);
        }
        case 'copyMap': {
          return (
            confirmCopyMap(val, reject) &&
            // For a copyMap to be a key, all its keys and values must
            // be keys. Keys already checked by `confirmCopyMap` since
            // that's a copyMap requirement in general.
            everyCopyMapValue(val, checkIt)
          );
        }
        default: {
          return (
            reject && reject`A passable tagged ${q(tag)} is not a key: ${val}`
          );
        }
      }
    }
    case 'error':
    case 'promise': {
      return reject && reject`A ${q(passStyle)} cannot be a key`;
    }
    default: {
      // Unexpected tags are just non-keys, but an unexpected passStyle
      // is always an error.
      throw Fail`unexpected passStyle ${q(passStyle)}: ${val}`;
    }
  }
};
})()
,
// === 59. common ./make-iterator.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);

/**
 * Makes a one-shot iterable iterator from a provided `next` function.
 *
 * @template [T=unknown]
 * @param {() => IteratorResult<T>} next
 * @returns {IterableIterator<T>}
 */
       const makeIterator = next => {
  const iter = harden({
    [Symbol.iterator]: () => iter,
    next,
  });
  return iter;
};$h͏_once.makeIterator(makeIterator);
harden(makeIterator);
})()
,
// === 60. common ./make-array-iterator.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,makeIterator;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./make-iterator.js", [["makeIterator",[$h͏_a => (makeIterator = $h͏_a)]]]]]);


/**
 * A `harden`ing analog of Array.prototype[Symbol.iterator].
 *
 * @template [T=unknown]
 * @param {Array<T>} arr
 * @returns {IterableIterator<T>}
 */
       const makeArrayIterator = arr => {
  const { length } = arr;
  let i = 0;
  return makeIterator(() => {
    /** @type {T} */
    let value;
    if (i < length) {
      value = arr[i];
      i += 1;
      return harden({ done: false, value });
    }
    // @ts-expect-error The terminal value doesn't matter
    return harden({ done: true, value });
  });
};$h͏_once.makeArrayIterator(makeArrayIterator);
harden(makeArrayIterator);
})()
,
// === 61. patterns ./src/keys/keycollection-operators.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,assertRankSorted,compareAntiRank,makeFullOrderComparatorKit,sortByRank,makeIterator,makeArrayIterator,q,Fail;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["assertRankSorted",[$h͏_a => (assertRankSorted = $h͏_a)]],["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]],["@endo/common/make-iterator.js", [["makeIterator",[$h͏_a => (makeIterator = $h͏_a)]]]],["@endo/common/make-array-iterator.js", [["makeArrayIterator",[$h͏_a => (makeArrayIterator = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]]]);

















/**
 * Refines a sequence of entries that is already sorted over its keys by the
 * `rankCompare` preorder, where there may be internal runs tied for the same
 * rank, into an iterable that resolves those ties using `fullCompare`.
 *
 * @template [V=unknown]
 * @param {Array<[Key, V]>} entries
 * @param {RankCompare} rankCompare
 * @param {FullCompare} fullCompare
 * @returns {IterableIterator<[Key, V]>}
 */
const generateFullSortedEntries = (entries, rankCompare, fullCompare) => {
  // @ts-expect-error XXX Key types
  assertRankSorted(entries, rankCompare);
  const { length } = entries;
  let i = 0;
  let sameRankIterator;
  return makeIterator(() => {
    if (sameRankIterator) {
      const result = sameRankIterator.next();
      if (!result.done) {
        return result;
      }
      sameRankIterator = undefined;
    }
    if (i < length) {
      const entry = entries[i];
      // Look ahead for same-rank ties.
      let j = i + 1;
      while (j < length && rankCompare(entry[0], entries[j][0]) === 0) {
        j += 1;
      }
      if (j === i + 1) {
        // No ties found.
        i = j;
        return harden({ done: false, value: entry });
      }
      const ties = entries.slice(i, j);
      i = j;

      // Sort the ties by `fullCompare`, enforce key uniqueness, and delegate to
      // a sub-iterator.
      // @ts-expect-error XXX Key types
      const sortedTies = sortByRank(ties, fullCompare);
      for (let k = 1; k < sortedTies.length; k += 1) {
        // @ts-expect-error XXX Key types
        const [key0] = sortedTies[k - 1];
        const [key1] = sortedTies[k];
        Math.sign(fullCompare(key0, key1)) ||
          Fail`Duplicate entry key: ${key0}`;
      }
      sameRankIterator = makeArrayIterator(sortedTies);
      return sameRankIterator.next();
    }
    return harden({ done: true, value: undefined });
  });
};
harden(generateFullSortedEntries);

/**
 * Returns an iterator that merges reverse-rank-sorted [key, value] entries of
 * two KeyCollections into a reverse-full-sorted [key, value1, value2] entries
 * by the key they have in common, representing the value for an absent entry in
 * either collection as `absentValue`.
 *
 * @template [C=KeyCollection]
 * @template [V=unknown]
 * @param {C} c1
 * @param {C} c2
 * @param {(collection: C) => Array<[Key, V]>} getEntries
 * @param {any} absentValue
 * @returns {IterableIterator<[Key, V | absentValue, V | absentValue]>}
 */
       const generateCollectionPairEntries = (
  c1,
  c2,
  getEntries,
  absentValue,
) => {
  const e1 = getEntries(c1);
  const e2 = getEntries(c2);

  // Establish a history-dependent comparison scoped to the active invocation
  // and use it to map reverse-preordered entries into an iterator with a
  // narrower total order.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;
  const x = generateFullSortedEntries(e1, compareAntiRank, fullCompare);
  const y = generateFullSortedEntries(e2, compareAntiRank, fullCompare);

  // Maintain a single-result { done, key, value } buffer for each iterator
  // so they can be merged.
  let xDone;
  let xKey;
  let xValue;
  let yDone;
  let yKey;
  let yValue;
  const nonEntry = [undefined, undefined];
  const nextX = () => {
    !xDone || Fail`Internal: nextX must not be called once done`;
    const result = xValue;
    ({ done: xDone, value: [xKey, xValue] = nonEntry } = x.next());
    return result;
  };
  nextX();
  const nextY = () => {
    !yDone || Fail`Internal: nextY must not be called once done`;
    const result = yValue;
    ({ done: yDone, value: [yKey, yValue] = nonEntry } = y.next());
    return result;
  };
  nextY();
  return makeIterator(() => {
    let done = false;
    /** @type {[Key, V | absentValue, V | absentValue]} */
    let value;
    if (xDone && yDone) {
      done = true;
      value = [undefined, absentValue, absentValue];
    } else if (xDone) {
      value = [yKey, absentValue, nextY()];
    } else if (yDone) {
      value = [xKey, nextX(), absentValue];
    } else {
      // Compare the keys to determine if we should return a merged result
      // or a one-sided result.
      const comp = fullCompare(xKey, yKey);
      if (comp === 0) {
        value = [xKey, nextX(), nextY()];
      } else if (comp < 0) {
        value = [xKey, nextX(), absentValue];
      } else if (comp > 0) {
        value = [yKey, absentValue, nextY()];
      } else {
        throw Fail`Unexpected key comparison ${q(comp)} for ${xKey} vs ${yKey}`;
      }
    }
    return harden({ done, value });
  });
};$h͏_once.generateCollectionPairEntries(generateCollectionPairEntries);
harden(generateCollectionPairEntries);

/**
 * Returns a function for comparing two KeyCollections of the same type using
 * the provided entries factory and same-key entry value comparator (where the
 * value for an absent entry in one collection is `absentValue`).
 *
 * If the corresponding entries for any single key are incomparable or the
 * comparison result has the opposite sign of the result for a different key,
 * then the KeyCollections are incomparable. Otherwise, the collections compare
 * by the result of any non-equal entry comparison, or compare equal if there is
 * no non-equal entry comparison result.
 * For example, given CopyBags X and Y and a value comparator that goes by count
 * (defaulting absent keys to a count of 0), X is smaller than Y (`result < 0`)
 * iff there are no keys in X that are either absent from Y
 * (`compareValues(xCount, absentValue) > 0`) or present in Y with a lower count
 * (`compareValues(xCount, yCount) > 0`) AND there is at least one key in Y that
 * is either absent from X (`compareValues(absentValue, yCount) < 0`) or present
 * with a lower count (`compareValues(xCount, yCount) < 0`).
 *
 * This can be generalized to virtual collections in the future by replacing
 * `getEntries => Array` with `generateEntries => IterableIterator`.
 *
 * @template [C=KeyCollection]
 * @template [V=unknown]
 * @param {(collection: C) => Array<[Key, V]>} getEntries
 * @param {V} absentValue
 * @param {KeyCompare} compareValues
 * @returns {(left: C, right: C) => KeyComparison}
 */
       const makeCompareCollection = (getEntries, absentValue, compareValues) =>
  harden((left, right) => {
    const merged = generateCollectionPairEntries(
      left,
      right,
      getEntries,
      absentValue,
    );
    let leftIsBigger = false;
    let rightIsBigger = false;
    for (const [_key, leftValue, rightValue] of merged) {
      const comp = compareValues(leftValue, rightValue);
      if (comp === 0) {
        // eslint-disable-next-line no-continue
        continue;
      } else if (comp < 0) {
        // Based on this key, left < right.
        rightIsBigger = true;
      } else if (comp > 0) {
        // Based on this key, left > right.
        leftIsBigger = true;
      } else {
        Number.isNaN(comp) ||
          // prettier-ignore
          Fail`Unexpected value comparison ${q(comp)} for ${leftValue} vs ${rightValue}`;
        return NaN;
      }
      if (leftIsBigger && rightIsBigger) {
        return NaN;
      }
    }
    // eslint-disable-next-line no-nested-ternary
    return leftIsBigger ? 1 : rightIsBigger ? -1 : 0;
  });$h͏_once.makeCompareCollection(makeCompareCollection);
harden(makeCompareCollection);
})()
,
// === 62. patterns ./src/keys/compareKeys.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,passStyleOf,getTag,compareNumerics,compareRank,recordNames,recordValues,q,Fail,assertKey,getCopyBagEntries,getCopyMapEntryArray,getCopySetKeys,makeCompareCollection;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]],["compareNumerics",[$h͏_a => (compareNumerics = $h͏_a)]],["compareRank",[$h͏_a => (compareRank = $h͏_a)]],["recordNames",[$h͏_a => (recordNames = $h͏_a)]],["recordValues",[$h͏_a => (recordValues = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./checkKey.js", [["assertKey",[$h͏_a => (assertKey = $h͏_a)]],["getCopyBagEntries",[$h͏_a => (getCopyBagEntries = $h͏_a)]],["getCopyMapEntryArray",[$h͏_a => (getCopyMapEntryArray = $h͏_a)]],["getCopySetKeys",[$h͏_a => (getCopySetKeys = $h͏_a)]]]],["./keycollection-operators.js", [["makeCompareCollection",[$h͏_a => (makeCompareCollection = $h͏_a)]]]]]);

















/** @import {CopySet, Key, KeyCompare} from '../types.js' */

/**
 * CopySet X is smaller than CopySet Y iff all of these conditions hold:
 * 1. For every x in X, x is also in Y.
 * 2. There is a y in Y that is not in X.
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
       const setCompare = makeCompareCollection(
  /** @type {<K extends Key>(s: CopySet<K>) => Array<[K, 1]>} */ (
    s => harden(getCopySetKeys(s).map(key => [key, 1]))
  ),
  0,
  compareNumerics,
);$h͏_once.setCompare(setCompare);
harden(setCompare);

/**
 * CopyBag X is smaller than CopyBag Y iff all of these conditions hold
 * (where `count(A, a)` is shorthand for the count associated with `a` in `A`):
 * 1. For every x in X, x is also in Y and count(X, x) <= count(Y, x).
 * 2. There is a y in Y such that y is not in X or count(X, y) < count(Y, y).
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
       const bagCompare = makeCompareCollection(
  getCopyBagEntries,
  0n,
  compareNumerics,
);$h͏_once.bagCompare(bagCompare);
harden(bagCompare);

// TODO The desired semantics for CopyMap comparison have not yet been decided.
// See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
// The below is a currently-unused extension of CopyBag semantics (i.e., absent
// entries treated as present with a value that is smaller than everything).
/**
 * A unique local value that is guaranteed to not exist in any inbound data
 * structure (which would not be the case if we used `Symbol.for`).
 * Note that `ABSENT` is not passable, and so only exists at the JS level of
 * abstraction, not pass-style.
 */
const ABSENT = Symbol('absent');

/**
 * CopyMap X is smaller than CopyMap Y iff all of these conditions hold:
 * 1. X and Y are both Keys (i.e., neither contains non-comparable data).
 * 2. For every x in X, x is also in Y and X[x] is smaller than or equivalent to Y[x].
 * 3. There is a y in Y such that y is not in X or X[y] is smaller than Y[y].
 *
 * X is equivalent to Y iff conditions 1 and 2 hold but condition 3 does not.
 */
// eslint-disable-next-line no-underscore-dangle
const _mapCompare = makeCompareCollection(
  getCopyMapEntryArray,
  ABSENT,
  (leftValue, rightValue) => {
    if (leftValue === ABSENT && rightValue === ABSENT) {
      throw Fail`Internal: Unexpected absent entry pair`;
    } else if (leftValue === ABSENT) {
      return -1;
    } else if (rightValue === ABSENT) {
      return 1;
    } else {
      // eslint-disable-next-line no-use-before-define
      return compareKeys(leftValue, rightValue);
    }
  },
);
harden(_mapCompare);

/** @type {KeyCompare} */
       const compareKeys = (left, right) => {
  assertKey(left);
  assertKey(right);
  const leftStyle = passStyleOf(left);
  const rightStyle = passStyleOf(right);
  if (leftStyle !== rightStyle) {
    // Different passStyles are incommensurate
    return NaN;
  }
  switch (leftStyle) {
    case 'undefined':
    case 'null':
    case 'boolean':
    case 'bigint':
    case 'string':
    case 'byteArray':
    case 'symbol': {
      // for these, keys compare the same as rank
      return compareRank(left, right);
    }
    case 'number': {
      const rankComp = compareRank(left, right);
      if (rankComp === 0) {
        return 0;
      }
      if (Number.isNaN(left) || Number.isNaN(right)) {
        // NaN is equal to itself, but incommensurate with everything else
        assert(!Number.isNaN(left) || !Number.isNaN(right));
        return NaN;
      }
      // Among non-NaN numbers, key order is the same as rank order. Note that
      // in both orders, `-0` is in the same equivalence class as `0`.
      return rankComp;
    }
    case 'remotable': {
      if (left === right) {
        return 0;
      }
      // If two remotables are not identical, then as keys they are
      // incommensurate.
      return NaN;
    }
    case 'copyArray': {
      // Lexicographic by key order. Rank order of arrays is lexicographic by
      // rank order.
      // Because the invariants above apply to the elements of the array,
      // they apply to the array as a whole.
      // @ts-expect-error narrowed
      const len = Math.min(left.length, right.length);
      for (let i = 0; i < len; i += 1) {
        // @ts-expect-error narrowed
        const result = compareKeys(left[i], right[i]);
        if (result !== 0) {
          return result;
        }
      }
      // If all matching elements are keyEQ, then according to their lengths.
      // Thus, if array X is a prefix of array Y, then X is smaller than Y.
      // @ts-expect-error narrowed
      return compareRank(left.length, right.length);
    }
    case 'copyRecord': {
      // Pareto partial order comparison.
      // @ts-expect-error narrowed
      const leftNames = recordNames(left);
      // @ts-expect-error narrowed
      const rightNames = recordNames(right);

      // eslint-disable-next-line no-use-before-define
      if (!keyEQ(leftNames, rightNames)) {
        // If they do not have exactly the same properties,
        // they are incommensurate.
        // Note that rank sorting of copyRecords groups all copyRecords with
        // the same keys together, enabling range searching over copyRecords
        // to avoid more irrelevant ones.
        return NaN;
      }
      // @ts-expect-error narrowed
      const leftValues = recordValues(left, leftNames);
      // @ts-expect-error narrowed
      const rightValues = recordValues(right, rightNames);
      // Presume that both copyRecords have the same key order
      // until encountering a property disproving that hypothesis.
      let result = 0;
      for (let i = 0; i < leftValues.length; i += 1) {
        const comp = compareKeys(leftValues[i], rightValues[i]);
        if (Number.isNaN(comp)) {
          return NaN;
        }
        if (result !== comp && comp !== 0) {
          if (result === 0) {
            result = comp;
          } else {
            assert(
              (result === -1 && comp === 1) || (result === 1 && comp === -1),
            );
            return NaN;
          }
        }
      }
      // If copyRecord X is smaller than copyRecord Y, then they must have the
      // same property names and every value in X must be smaller or equal to
      // the corresponding value in Y (with at least one value smaller).
      // The rank order of X and Y is based on lexicographic rank order of
      // their values, as organized by reverse lexicographic order of their
      // property names.
      // Thus if compareKeys(X,Y) < 0 then compareRank(X,Y) < 0.
      return result;
    }
    case 'tagged': {
      // @ts-expect-error narrowed
      const leftTag = getTag(left);
      // @ts-expect-error narrowed
      const rightTag = getTag(right);
      if (leftTag !== rightTag) {
        // different tags are incommensurate
        return NaN;
      }
      switch (leftTag) {
        case 'copySet': {
          // @ts-expect-error narrowed
          return setCompare(left, right);
        }
        case 'copyBag': {
          // @ts-expect-error narrowed
          return bagCompare(left, right);
        }
        case 'copyMap': {
          // TODO The desired semantics for CopyMap comparison have not yet been decided.
          // See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
          throw Fail`Map comparison not yet implemented: ${left} vs ${right}`;
        }
        default: {
          throw Fail`unexpected tag ${q(leftTag)}: ${left}`;
        }
      }
    }
    default: {
      throw Fail`unexpected passStyle ${q(leftStyle)}: ${left}`;
    }
  }
};$h͏_once.compareKeys(compareKeys);
harden(compareKeys);

       const keyLT = (left, right) => compareKeys(left, right) < 0;$h͏_once.keyLT(keyLT);
harden(keyLT);

       const keyLTE = (left, right) => compareKeys(left, right) <= 0;$h͏_once.keyLTE(keyLTE);
harden(keyLTE);

       const keyEQ = (left, right) => compareKeys(left, right) === 0;$h͏_once.keyEQ(keyEQ);
harden(keyEQ);

       const keyGTE = (left, right) => compareKeys(left, right) >= 0;$h͏_once.keyGTE(keyGTE);
harden(keyGTE);

       const keyGT = (left, right) => compareKeys(left, right) > 0;$h͏_once.keyGT(keyGT);
harden(keyGT);
})()
,
// === 63. patterns ./src/keys/merge-set-operators.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,assertRankSorted,compareAntiRank,makeFullOrderComparatorKit,sortByRank,q,Fail,assertNoDuplicates,makeSetOfElements;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["assertRankSorted",[$h͏_a => (assertRankSorted = $h͏_a)]],["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./copySet.js", [["assertNoDuplicates",[$h͏_a => (assertNoDuplicates = $h͏_a)]],["makeSetOfElements",[$h͏_a => (makeSetOfElements = $h͏_a)]]]]]);









/**
 * @import {Passable} from '@endo/pass-style';
 * @import {FullCompare, RankCompare} from '@endo/marshal'
 * @import {KeyComparison} from '../types.js'
 */

// TODO share more code with keycollection-operators.js.

/**
 * Asserts that `elements` is already rank sorted by `rankCompare`, where there
 * may be contiguous regions of elements tied for the same rank.
 * Returns an iterable that will enumerate all the elements in order
 * according to `fullOrder`, which should differ from `rankOrder` only
 * by being more precise.
 *
 * This should be equivalent to resorting the entire `elements` array according
 *  to `fullOrder`. However, it optimizes for the case where these contiguous
 * runs that need to be resorted are either absent or small.
 *
 * @template {Passable} T
 * @param {T[]} elements
 * @param {RankCompare} rankCompare
 * @param {FullCompare} fullCompare
 * @returns {Iterable<T>}
 */
const windowResort = (elements, rankCompare, fullCompare) => {
  assertRankSorted(elements, rankCompare);
  const { length } = elements;
  let i = 0;
  let optInnerIterator;
  return harden({
    [Symbol.iterator]: () =>
      harden({
        next: () => {
          if (optInnerIterator) {
            const result = optInnerIterator.next();
            if (result.done) {
              optInnerIterator = undefined;
              // fall through
            } else {
              return result;
            }
          }
          if (i < length) {
            const value = elements[i];
            let j = i + 1;
            while (j < length && rankCompare(value, elements[j]) === 0) {
              j += 1;
            }
            if (j === i + 1) {
              i = j;
              return harden({ done: false, value });
            }
            const similarRun = elements.slice(i, j);
            i = j;
            const resorted = sortByRank(similarRun, fullCompare);
            // Providing the same `fullCompare` should cause a memo hit
            // within `assertNoDuplicates` enabling it to avoid a
            // redundant resorting.
            assertNoDuplicates(resorted, fullCompare);
            // This is the raw JS array iterator whose `.next()` method
            // does not harden the IteratorResult, in violation of our
            // conventions. Fixing this is expensive and I'm confident the
            // unfrozen value does not escape this file, so I'm leaving this
            // as is.
            optInnerIterator = resorted[Symbol.iterator]();
            return optInnerIterator.next();
          } else {
            return harden({ done: true, value: null });
          }
        },
      }),
  });
};

/**
 * Returns an iterable whose iteration results are [key, xCount, yCount] tuples
 * representing the next key in the local full order, as well as how many
 * times it occurred in the x input iterator and the y input iterator.
 *
 * For sets, these counts are always 0 or 1, but this representation
 * generalizes nicely for bags.
 *
 * @template {Passable} T
 * @param {T[]} xelements
 * @param {T[]} yelements
 * @returns {Iterable<[T,bigint,bigint]>}
 */
const merge = (xelements, yelements) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one `merge` call and does not survive it.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;

  const xs = windowResort(xelements, compareAntiRank, fullCompare);
  const ys = windowResort(yelements, compareAntiRank, fullCompare);
  return harden({
    [Symbol.iterator]: () => {
      // These four `let` variables are buffering one ahead from the underlying
      // iterators. Each iteration reports one or the other or both, and
      // then refills the buffers of those it advanced.
      /** @type {T} */
      let x;
      let xDone;
      /** @type {T} */
      let y;
      let yDone;

      const xi = xs[Symbol.iterator]();
      const nextX = () => {
        !xDone || Fail`Internal: nextX should not be called once done`;
        ({ done: xDone, value: x } = xi.next());
      };
      nextX();

      const yi = ys[Symbol.iterator]();
      const nextY = () => {
        !yDone || Fail`Internal: nextY should not be called once done`;
        ({ done: yDone, value: y } = yi.next());
      };
      nextY();

      return harden({
        next: () => {
          /** @type {boolean} */
          let done = false;
          /** @type {[T,bigint,bigint]} */
          let value;
          if (xDone && yDone) {
            done = true;
            // @ts-expect-error Because the terminating value does not matter
            value = [null, 0n, 0n];
          } else if (xDone) {
            // only ys are left
            value = [y, 0n, 1n];
            nextY();
          } else if (yDone) {
            // only xs are left
            value = [x, 1n, 0n];
            nextX();
          } else {
            const comp = fullCompare(x, y);
            if (comp === 0) {
              // x and y are equivalent, so report both
              value = [x, 1n, 1n];
              nextX();
              nextY();
            } else if (comp < 0) {
              // x is earlier, so report it
              value = [x, 1n, 0n];
              nextX();
            } else {
              // y is earlier, so report it
              comp > 0 || Fail`Internal: Unexpected comp ${q(comp)}`;
              value = [y, 0n, 1n];
              nextY();
            }
          }
          return harden({ done, value });
        },
      });
    },
  });
};
harden(merge);

const iterIsSuperset = xyi => {
  for (const [_m, xc, _yc] of xyi) {
    if (xc === 0n) {
      // something in y is not in x, so x is not a superset of y
      return false;
    }
  }
  return true;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {boolean}
 */
const iterIsDisjoint = xyi => {
  for (const [_m, xc, yc] of xyi) {
    if (xc >= 1n && yc >= 1n) {
      // Something in both, so not disjoint
      return false;
    }
  }
  return true;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {KeyComparison}
 */
const iterCompare = xyi => {
  let loneY = false;
  let loneX = false;
  for (const [_m, xc, yc] of xyi) {
    if (xc === 0n) {
      // something in y is not in x, so x is not a superset of y
      loneY = true;
    }
    if (yc === 0n) {
      // something in x is not in y, so y is not a superset of x
      loneX = true;
    }
    if (loneX && loneY) {
      return NaN;
    }
  }
  if (loneX) {
    return 1;
  } else if (loneY) {
    return -1;
  } else {
    (!loneX && !loneY) ||
      Fail`Internal: Unexpected lone pair ${q([loneX, loneY])}`;
    return 0;
  }
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {T[]}
 */
const iterUnion = xyi => {
  const result = [];
  for (const [m, xc, yc] of xyi) {
    if (xc >= 0n) {
      result.push(m);
    } else {
      yc >= 0n || Fail`Internal: Unexpected count ${q(yc)}`;
      // if x and y were both ready, then they were equivalent and
      // above clause already took care of it. Otherwise push here.
      result.push(m);
    }
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {T[]}
 */
const iterDisjointUnion = xyi => {
  const result = [];
  for (const [m, xc, yc] of xyi) {
    xc === 0n || yc === 0n || Fail`Sets must not have common elements: ${m}`;
    if (xc >= 1n) {
      result.push(m);
    } else {
      yc >= 1n || Fail`Internal: Unexpected count ${q(yc)}`;
      result.push(m);
    }
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {T[]}
 */
const iterIntersection = xyi => {
  const result = [];
  for (const [m, xc, yc] of xyi) {
    if (xc >= 1n && yc >= 1n) {
      // If they are both present, then they were equivalent
      result.push(m);
    }
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {T[]}
 */
const iterDisjointSubtract = xyi => {
  const result = [];
  for (const [m, xc, yc] of xyi) {
    xc >= 1n || Fail`right element ${m} was not in left`;
    if (yc === 0n) {
      // the x was not in y
      result.push(m);
    }
  }
  return result;
};

const mergeify = iterOp => (xelements, yelements) =>
  iterOp(merge(xelements, yelements));

       const elementsIsSuperset = mergeify(iterIsSuperset);$h͏_once.elementsIsSuperset(elementsIsSuperset);
       const elementsIsDisjoint = mergeify(iterIsDisjoint);$h͏_once.elementsIsDisjoint(elementsIsDisjoint);
       const elementsCompare = mergeify(iterCompare);$h͏_once.elementsCompare(elementsCompare);
       const elementsUnion = mergeify(iterUnion);$h͏_once.elementsUnion(elementsUnion);
       const elementsDisjointUnion = mergeify(iterDisjointUnion);$h͏_once.elementsDisjointUnion(elementsDisjointUnion);
       const elementsIntersection = mergeify(iterIntersection);$h͏_once.elementsIntersection(elementsIntersection);
       const elementsDisjointSubtract = mergeify(iterDisjointSubtract);$h͏_once.elementsDisjointSubtract(elementsDisjointSubtract);

const rawSetify = elementsOp => (xset, yset) =>
  elementsOp(xset.payload, yset.payload);

const setify = elementsOp => (xset, yset) =>
  makeSetOfElements(elementsOp(xset.payload, yset.payload));

       const setIsSuperset = rawSetify(elementsIsSuperset);$h͏_once.setIsSuperset(setIsSuperset);
       const setIsDisjoint = rawSetify(elementsIsDisjoint);$h͏_once.setIsDisjoint(setIsDisjoint);
       const setUnion = setify(elementsUnion);$h͏_once.setUnion(setUnion);
       const setDisjointUnion = setify(elementsDisjointUnion);$h͏_once.setDisjointUnion(setDisjointUnion);
       const setIntersection = setify(elementsIntersection);$h͏_once.setIntersection(setIntersection);
       const setDisjointSubtract = setify(elementsDisjointSubtract);$h͏_once.setDisjointSubtract(setDisjointSubtract);
})()
,
// === 64. patterns ./src/keys/merge-bag-operators.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,assertRankSorted,compareAntiRank,makeFullOrderComparatorKit,sortByRank,q,Fail,assertNoDuplicateKeys,makeBagOfEntries;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/marshal", [["assertRankSorted",[$h͏_a => (assertRankSorted = $h͏_a)]],["compareAntiRank",[$h͏_a => (compareAntiRank = $h͏_a)]],["makeFullOrderComparatorKit",[$h͏_a => (makeFullOrderComparatorKit = $h͏_a)]],["sortByRank",[$h͏_a => (sortByRank = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./copyBag.js", [["assertNoDuplicateKeys",[$h͏_a => (assertNoDuplicateKeys = $h͏_a)]],["makeBagOfEntries",[$h͏_a => (makeBagOfEntries = $h͏_a)]]]]]);









/**
 * @import {FullCompare, RankCompare} from '@endo/marshal'
 * @import {Key} from '../types.js'
 */

// Based on merge-set-operators.js, but altered for the bag representation.
// TODO share more code with that file and keycollection-operators.js.

/**
 * Asserts that `bagEntries` is already rank sorted by `rankCompare`, where
 * there
 * may be contiguous regions of bagEntries whose keys are tied for the same
 * rank.
 * Returns an iterable that will enumerate all the bagEntries in order
 * according to `fullOrder`, which should differ from `rankOrder` only
 * by being more precise.
 *
 * This should be equivalent to resorting the entire `bagEntries` array
 * according
 * to `fullOrder`. However, it optimizes for the case where these contiguous
 * runs that need to be resorted are either absent or small.
 *
 * @template {Key} T
 * @param {[T,bigint][]} bagEntries
 * @param {RankCompare} rankCompare
 * @param {FullCompare} fullCompare
 * @returns {Iterable<[T,bigint]>}
 */
const bagWindowResort = (bagEntries, rankCompare, fullCompare) => {
  assertRankSorted(bagEntries, rankCompare);
  const { length } = bagEntries;
  let i = 0;
  let optInnerIterator;
  return harden({
    [Symbol.iterator]: () =>
      harden({
        next: () => {
          if (optInnerIterator) {
            const result = optInnerIterator.next();
            if (result.done) {
              optInnerIterator = undefined;
              // fall through
            } else {
              return result;
            }
          }
          if (i < length) {
            const entry = bagEntries[i];
            let j = i + 1;
            while (
              j < length &&
              rankCompare(entry[0], bagEntries[j][0]) === 0
            ) {
              j += 1;
            }
            if (j === i + 1) {
              i = j;
              return harden({ done: false, value: entry });
            }
            const similarRun = bagEntries.slice(i, j);
            i = j;
            const resorted = sortByRank(similarRun, fullCompare);
            // Providing the same `fullCompare` should cause a memo hit
            // within `assertNoDuplicates` enabling it to avoid a
            // redundant resorting.
            assertNoDuplicateKeys(resorted, fullCompare);
            // This is the raw JS array iterator whose `.next()` method
            // does not harden the IteratorResult, in violation of our
            // conventions. Fixing this is expensive and I'm confident the
            // unfrozen value does not escape this file, so I'm leaving this
            // as is.
            optInnerIterator = resorted[Symbol.iterator]();
            return optInnerIterator.next();
          } else {
            return harden({ done: true, value: [null, 0n] });
          }
        },
      }),
  });
};

/**
 * Returns an iterable whose iteration results are [key, xCount, yCount] tuples
 * representing the next key in the local full order, as well as how many
 * times it occurred in the x input iterator and the y input iterator.
 *
 * For sets, these counts are always 0 or 1, but this representation
 * generalizes nicely for bags.
 *
 * @template {Key} T
 * @param {[T,bigint][]} xbagEntries
 * @param {[T,bigint][]} ybagEntries
 * @returns {Iterable<[T,bigint,bigint]>}
 */
const merge = (xbagEntries, ybagEntries) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one `merge` call and does not survive it.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;

  const xs = bagWindowResort(xbagEntries, compareAntiRank, fullCompare);
  const ys = bagWindowResort(ybagEntries, compareAntiRank, fullCompare);
  return harden({
    [Symbol.iterator]: () => {
      // These six `let` variables are buffering one ahead from the underlying
      // iterators. Each iteration reports one or the other or both, and
      // then refills the buffers of those it advanced.
      /** @type {T} */
      let x;
      let xc;
      let xDone;
      /** @type {T} */
      let y;
      let yc;
      let yDone;

      const xi = xs[Symbol.iterator]();
      const nextX = () => {
        !xDone || Fail`Internal: nextX should not be called once done`;
        ({
          done: xDone,
          value: [x, xc],
        } = xi.next());
      };
      nextX();

      const yi = ys[Symbol.iterator]();
      const nextY = () => {
        !yDone || Fail`Internal: nextY should not be called once done`;
        ({
          done: yDone,
          value: [y, yc],
        } = yi.next());
      };
      nextY();

      return harden({
        next: () => {
          /** @type {boolean} */
          let done = false;
          /** @type {[T,bigint,bigint]} */
          let value;
          if (xDone && yDone) {
            done = true;
            // @ts-expect-error Because the terminating value does not matter
            value = [null, 0n, 0n];
          } else if (xDone) {
            // only ys are left
            value = [y, 0n, yc];
            nextY();
          } else if (yDone) {
            // only xs are left
            value = [x, xc, 0n];
            nextX();
          } else {
            const comp = fullCompare(x, y);
            if (comp === 0) {
              // x and y are equivalent, so report both
              value = [x, xc, yc];
              nextX();
              nextY();
            } else if (comp < 0) {
              // x is earlier, so report it
              value = [x, xc, 0n];
              nextX();
            } else {
              // y is earlier, so report it
              comp > 0 || Fail`Internal: Unexpected comp ${q(comp)}`;
              value = [y, 0n, yc];
              nextY();
            }
          }
          return harden({ done, value });
        },
      });
    },
  });
};
harden(merge);

// We should be able to use this for iterIsSuperset as well.
// The generalization is free.
/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {boolean}
 */
const bagIterIsSuperbag = xyi => {
  for (const [_m, xc, yc] of xyi) {
    if (xc < yc) {
      // something in y is not in x, so x is not a superbag of y
      return false;
    }
  }
  return true;
};

// We should be able to use this for iterIsDisjoint as well.
// The code is identical.
/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {boolean}
 */
const bagIterIsDisjoint = xyi => {
  for (const [_m, xc, yc] of xyi) {
    if (xc >= 1n && yc >= 1n) {
      // Something in both, so not disjoint
      return false;
    }
  }
  return true;
};

/**
 * @template T
 * @param {[T,bigint,bigint][]} xyi
 * @returns {[T,bigint][]}
 */
const bagIterUnion = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    result.push([m, xc + yc]);
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {[T,bigint][]}
 */
const bagIterIntersection = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    const mc = xc <= yc ? xc : yc;
    result.push([m, mc]);
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {[T,bigint][]}
 */
const bagIterDisjointSubtract = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    const mc = xc - yc;
    mc >= 0n || Fail`right element ${m} was not in left`;
    if (mc >= 1n) {
      // the x was not in y
      result.push([m, mc]);
    }
  }
  return result;
};

const mergeify = bagIterOp => (xbagEntries, ybagEntries) =>
  bagIterOp(merge(xbagEntries, ybagEntries));

const bagEntriesIsSuperbag = mergeify(bagIterIsSuperbag);
const bagEntriesIsDisjoint = mergeify(bagIterIsDisjoint);
const bagEntriesUnion = mergeify(bagIterUnion);
const bagEntriesIntersection = mergeify(bagIterIntersection);
const bagEntriesDisjointSubtract = mergeify(bagIterDisjointSubtract);

const rawBagify = bagEntriesOp => (xbag, ybag) =>
  bagEntriesOp(xbag.payload, ybag.payload);

const bagify = bagEntriesOp => (xbag, ybag) =>
  makeBagOfEntries(bagEntriesOp(xbag.payload, ybag.payload));

       const bagIsSuperbag = rawBagify(bagEntriesIsSuperbag);$h͏_once.bagIsSuperbag(bagIsSuperbag);
       const bagIsDisjoint = rawBagify(bagEntriesIsDisjoint);$h͏_once.bagIsDisjoint(bagIsDisjoint);
       const bagUnion = bagify(bagEntriesUnion);$h͏_once.bagUnion(bagUnion);
       const bagIntersection = bagify(bagEntriesIntersection);$h͏_once.bagIntersection(bagIntersection);
       const bagDisjointSubtract = bagify(bagEntriesDisjointSubtract);$h͏_once.bagDisjointSubtract(bagDisjointSubtract);
})()
,
// === 65. common ./throw-labeled.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let X,makeError,annotateError,hideAndHardenFunction;$h͏_imports([["@endo/errors", [["X",[$h͏_a => (X = $h͏_a)]],["makeError",[$h͏_a => (makeError = $h͏_a)]],["annotateError",[$h͏_a => (annotateError = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]]]);






/**
 * Given an error `innerErr` and a `label`, throws a similar
 * error whose message string is `${label}: ${innerErr.message}`.
 * See `applyLabelingError` for the motivating use.
 *
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {import('ses').GenericErrorConstructor} [errConstructor]
 * @param {import('ses').AssertMakeErrorOptions} [options]
 * @returns {never}
 */
       const throwLabeled = (
  innerErr,
  label,
  errConstructor = undefined,
  options = undefined,
) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = makeError(
    `${label}: ${innerErr.message}`,
    errConstructor,
    options,
  );
  annotateError(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};$h͏_once.throwLabeled(throwLabeled);
hideAndHardenFunction(throwLabeled);
})()
,
// === 66. common ./apply-labeling-error.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let hideAndHardenFunction,E,isPromise,throwLabeled;$h͏_imports([["@endo/errors", [["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/eventual-send", [["E",[$h͏_a => (E = $h͏_a)]]]],["@endo/promise-kit", [["isPromise",[$h͏_a => (isPromise = $h͏_a)]]]],["./throw-labeled.js", [["throwLabeled",[$h͏_a => (throwLabeled = $h͏_a)]]]]]);




/**
 * Calls `func(...args)`, but annotating any failure error with `label`.
 *
 * If `label` is omitted or `undefined`, then this is equivalent to
 * `func(...args).
 *
 * Otherwise, if it successfully returns a non-promise, that non-promise is
 * returned.
 *
 * If it throws, rethrow a similar error whose message is
 * ```js
 * `${label}: ${originalMessage}`
 * ```
 * That way, in an error happens deep within a stack of calls to
 * `applyLabelingError`, the resulting error will show the stack of labels.
 *
 * If it returns a promise, then `applyLabelingError` cannot tell until that
 * promise settles whether it represents a success or failure. So it immediately
 * returns a new promise. If the original promise fulfills, then the
 * fulfillment is propagated to the returned promise.
 *
 * If the promise rejects with an error, then the returned promise is
 * rejected with a similar promise, prefixed with the label in that same way.
 *
 * @template A,R
 * @param {(...args: A[]) => R} func
 * @param {A[]} args
 * @param {string|number} [label]
 * @returns {R}
 */
       const applyLabelingError = (func, args, label = undefined) => {
  if (label === undefined) {
    return func(...args);
  }
  let result;
  try {
    result = func(...args);
  } catch (err) {
    throwLabeled(err, label);
  }
  if (isPromise(result)) {
    // Cannot be at-ts-expect-error because there is no type error locally.
    // Rather, a type error only as imported into exo.
    // @ts-ignore If result is a rejected promise, this will
    // return a promise with a different rejection reason. But this
    // confuses TypeScript because it types that case as `Promise<never>`
    // which is cool for a promise that will never fulfll.
    // But TypeScript doesn't understand that this will only happen
    // when `result` was a rejected promise. In only this case `R`
    // should already allow `Promise<never>` as a subtype.
    return E.when(result, undefined, reason => throwLabeled(reason, label));
  } else {
    return result;
  }
};$h͏_once.applyLabelingError(applyLabelingError);
hideAndHardenFunction(applyLabelingError);
})()
,
// === 67. common ./from-unique-entries.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,q,Fail;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]]]);


const { fromEntries } = Object;
const { ownKeys } = Reflect;

/**
 * Throws if multiple entries use the same property name. Otherwise acts
 * like `Object.fromEntries` but hardens the result.
 * Use it to protect from property names computed from user-provided data.
 *
 * @template [T=any]
 * @param {Iterable<readonly [PropertyKey, T]>} allEntries
 * @returns {{ [k: string]: T; }}
 */
       const fromUniqueEntries = allEntries => {
  const entriesArray = [...allEntries];
  const result = harden(fromEntries(entriesArray));
  if (ownKeys(result).length === entriesArray.length) {
    return result;
  }
  const names = new Set();
  for (const [name, _] of entriesArray) {
    if (names.has(name)) {
      Fail`collision on property name ${q(name)}: ${entriesArray}`;
    }
    names.add(name);
  }
  throw Fail`internal: failed to create object from unique entries`;
};$h͏_once.fromUniqueEntries(fromUniqueEntries);
harden(fromUniqueEntries);
})()
,
// === 68. common ./list-difference.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]]]);

/**
 * Return a list of all the elements present in the `leftList` and not
 * in the `rightList`. Return in the order of their appearance in `leftList`.
 * Uses the comparison built into `Set` membership (SameValueZero)
 * which is like JavaScript's `===` except that it judges any `NaN` to
 * be the same as any `NaN` and it judges `0` to be the same a `-0`.
 *
 * This is often used on lists of names that should match, in order to generate
 * useful diagnostics about the unmatched names.
 *
 * @template {any} V
 * @param {V[]} leftList
 * @param {V[]} rightList
 */
       const listDifference = (leftList, rightList) => {
  const rightSet = new Set(rightList);
  return leftList.filter(element => !rightSet.has(element));
};$h͏_once.listDifference(listDifference);
harden(listDifference);
})()
,
// === 69. patterns ./src/patterns/patternMatchers.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,q,b,X,Fail,makeError,annotateError,hideAndHardenFunction,applyLabelingError,fromUniqueEntries,listDifference,Far,getTag,makeTagged,passStyleOf,nameForPassableSymbol,compareRank,getPassStyleCover,intersectRankCovers,unionRankCovers,recordNames,recordValues,qp,keyEQ,keyGT,keyGTE,keyLT,keyLTE,assertKey,confirmKey,isKey,confirmScalarKey,confirmCopySet,confirmCopyMap,copyMapKeySet,confirmCopyBag,getCopyMapEntryArray,makeCopyMap,makeCopySet,makeCopyBag,generateCollectionPairEntries;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["b",[$h͏_a => (b = $h͏_a)]],["X",[$h͏_a => (X = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]],["makeError",[$h͏_a => (makeError = $h͏_a)]],["annotateError",[$h͏_a => (annotateError = $h͏_a)]],["hideAndHardenFunction",[$h͏_a => (hideAndHardenFunction = $h͏_a)]]]],["@endo/common/apply-labeling-error.js", [["applyLabelingError",[$h͏_a => (applyLabelingError = $h͏_a)]]]],["@endo/common/from-unique-entries.js", [["fromUniqueEntries",[$h͏_a => (fromUniqueEntries = $h͏_a)]]]],["@endo/common/list-difference.js", [["listDifference",[$h͏_a => (listDifference = $h͏_a)]]]],["@endo/pass-style", [["Far",[$h͏_a => (Far = $h͏_a)]],["getTag",[$h͏_a => (getTag = $h͏_a)]],["makeTagged",[$h͏_a => (makeTagged = $h͏_a)]],["passStyleOf",[$h͏_a => (passStyleOf = $h͏_a)]],["nameForPassableSymbol",[$h͏_a => (nameForPassableSymbol = $h͏_a)]]]],["@endo/marshal", [["compareRank",[$h͏_a => (compareRank = $h͏_a)]],["getPassStyleCover",[$h͏_a => (getPassStyleCover = $h͏_a)]],["intersectRankCovers",[$h͏_a => (intersectRankCovers = $h͏_a)]],["unionRankCovers",[$h͏_a => (unionRankCovers = $h͏_a)]],["recordNames",[$h͏_a => (recordNames = $h͏_a)]],["recordValues",[$h͏_a => (recordValues = $h͏_a)]],["qp",[$h͏_a => (qp = $h͏_a)]]]],["../keys/compareKeys.js", [["keyEQ",[$h͏_a => (keyEQ = $h͏_a)]],["keyGT",[$h͏_a => (keyGT = $h͏_a)]],["keyGTE",[$h͏_a => (keyGTE = $h͏_a)]],["keyLT",[$h͏_a => (keyLT = $h͏_a)]],["keyLTE",[$h͏_a => (keyLTE = $h͏_a)]]]],["../keys/checkKey.js", [["assertKey",[$h͏_a => (assertKey = $h͏_a)]],["confirmKey",[$h͏_a => (confirmKey = $h͏_a)]],["isKey",[$h͏_a => (isKey = $h͏_a)]],["confirmScalarKey",[$h͏_a => (confirmScalarKey = $h͏_a)]],["confirmCopySet",[$h͏_a => (confirmCopySet = $h͏_a)]],["confirmCopyMap",[$h͏_a => (confirmCopyMap = $h͏_a)]],["copyMapKeySet",[$h͏_a => (copyMapKeySet = $h͏_a)]],["confirmCopyBag",[$h͏_a => (confirmCopyBag = $h͏_a)]],["getCopyMapEntryArray",[$h͏_a => (getCopyMapEntryArray = $h͏_a)]],["makeCopyMap",[$h͏_a => (makeCopyMap = $h͏_a)]],["makeCopySet",[$h͏_a => (makeCopySet = $h͏_a)]],["makeCopyBag",[$h͏_a => (makeCopyBag = $h͏_a)]]]],["../keys/keycollection-operators.js", [["generateCollectionPairEntries",[$h͏_a => (generateCollectionPairEntries = $h͏_a)]]]]]);

















































/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {CopyArray, CopyRecord, CopyTagged, Passable} from '@endo/pass-style';
 * @import {CopySet, CopyBag, ArgGuard, AwaitArgGuard, ConfirmPattern, GetRankCover, InterfaceGuard, MatcherNamespace, MethodGuard, MethodGuardMaker, Pattern, RawGuard, SyncValueGuard, Kind, Limits, AllLimits, Key, DefaultGuardType} from '../types.js';
 * @import {MatchHelper, PatternKit} from './types.js';
 */

const { entries, values, hasOwn } = Object;
const { ownKeys } = Reflect;

/** @type {WeakSet<Pattern>} */
const patternMemo = new WeakSet();

// /////////////////////// Match Helpers Helpers /////////////////////////////

/** For forward references to `M` */
let MM;

/**
 * The actual default values here are, at the present time, fairly
 * arbitrary choices and may change before they settle down. Of course
 * at some point we'll need to stop changing them. But we should first
 * see how our system holds up with these choices. The main criteria
 * is that they be big enough that "normal" innocent programs rarely
 * encounter these limits.
 *
 * Exported primarily for testing.
 */
       const defaultLimits = harden({
  decimalDigitsLimit: 100,
  stringLengthLimit: 100_000,
  symbolNameLengthLimit: 100,
  numPropertiesLimit: 80,
  propertyNameLengthLimit: 100,
  arrayLengthLimit: 10_000,
  byteLengthLimit: 100_000,
  numSetElementsLimit: 10_000,
  numUniqueBagElementsLimit: 10_000,
  numMapEntriesLimit: 5000,
});

/**
 * Use the result only to get the limits you need by destructuring.
 * Thus, the result only needs to support destructuring. The current
 * implementation uses inheritance as a cheap hack.
 *
 * @param {Limits} [limits]
 * @returns {AllLimits}
 */$h͏_once.defaultLimits(defaultLimits);
const limit = (limits = {}) =>
  /** @type {AllLimits} */ (harden({ __proto__: defaultLimits, ...limits }));

/**
 * @param {any} payload
 * @param {any} mainPayloadShape
 * @param {string} prefix
 * @param {Rejector} reject
 */
const confirmIsWellFormedWithLimit = (
  payload,
  mainPayloadShape,
  prefix,
  reject,
) => {
  assert(Array.isArray(mainPayloadShape));
  if (!Array.isArray(payload)) {
    return reject && reject`${q(prefix)} payload must be an array: ${payload}`;
  }

  const mainLength = mainPayloadShape.length;
  if (!(payload.length === mainLength || payload.length === mainLength + 1)) {
    return reject && reject`${q(prefix)} payload unexpected size: ${payload}`;
  }
  const limits = payload[mainLength];
  payload = harden(payload.slice(0, mainLength));
  // eslint-disable-next-line no-use-before-define
  if (!confirmLabeledMatches(payload, mainPayloadShape, prefix, reject)) {
    return false;
  }
  if (limits === undefined) {
    return true;
  }
  return (
    (passStyleOf(limits) === 'copyRecord' ||
      (reject && reject`Limits must be a record: ${q(limits)}`)) &&
    entries(limits).every(
      ([key, value]) =>
        passStyleOf(value) === 'number' ||
        (reject &&
          reject`Value of limit ${q(key)} but be a number: ${q(value)}`),
    )
  );
};

/**
 * @param {unknown} specimen
 * @param {number} decimalDigitsLimit
 * @param {Rejector} reject
 */
const confirmDecimalDigitsLimit = (specimen, decimalDigitsLimit, reject) => {
  if (
    Math.floor(Math.log10(Math.abs(Number(specimen)))) + 1 <=
    decimalDigitsLimit
  ) {
    return true;
  }
  return (
    reject &&
    reject`bigint ${specimen} must not have more than ${decimalDigitsLimit} digits`
  );
};

/**
 * @returns {PatternKit}
 */
const makePatternKit = () => {
  /**
   * If this is a recognized match tag, return the MatchHelper.
   * Otherwise result undefined.
   *
   * @param {string} tag
   * @returns {MatchHelper | undefined}
   */
  const maybeMatchHelper = tag =>
    // eslint-disable-next-line no-use-before-define
    HelpersByMatchTag[tag];

  /**
   * Note that this function indicates absence by returning `undefined`,
   * even though `undefined` is a valid pattern. To evade this confusion,
   * to register a payload shape with that meaning, use `MM.undefined()`.
   *
   * @param {string} tag
   * @returns {Pattern | undefined}
   */
  const maybePayloadShape = tag =>
    // eslint-disable-next-line no-use-before-define
    GuardPayloadShapes[tag];

  /** @type {Map<Kind, unknown>} */
  const singletonKinds = new Map([
    ['null', null],
    ['undefined', undefined],
  ]);

  /**
   * @type {WeakMap<CopyTagged, Kind>}
   * Only for tagged records of recognized kinds whose store-level invariants
   * have already been checked.
   */
  const tagMemo = new WeakMap();

  /**
   * Checks only recognized tags, and only if the tagged
   * passes the invariants associated with that recognition.
   *
   * @param {Passable} tagged
   * @param {Kind} tag
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmTagged = (tagged, tag, reject) => {
    const matchHelper = maybeMatchHelper(tag);
    if (matchHelper) {
      // Buried here is the important case, where we process
      // the various patternNodes
      return matchHelper.confirmIsWellFormed(tagged.payload, reject);
    } else {
      const payloadShape = maybePayloadShape(tag);
      if (payloadShape !== undefined) {
        // eslint-disable-next-line no-use-before-define
        return confirmNestedMatches(tagged.payload, payloadShape, tag, reject);
      }
    }
    switch (tag) {
      case 'copySet': {
        return confirmCopySet(tagged, reject);
      }
      case 'copyBag': {
        return confirmCopyBag(tagged, reject);
      }
      case 'copyMap': {
        return confirmCopyMap(tagged, reject);
      }
      default: {
        return (
          reject && reject`cannot check unrecognized tag ${q(tag)}: ${tagged}`
        );
      }
    }
  };

  /**
   * Returns only a recognized kind, and only if the specimen passes the
   * invariants associated with that recognition.
   * Otherwise, if `reject` is false, returns undefined. Else rejects.
   *
   * @param {any} specimen
   * @param {Rejector} reject
   * @returns {Kind | undefined}
   */
  const confirmKindOf = (specimen, reject) => {
    const passStyle = passStyleOf(specimen);
    if (passStyle !== 'tagged') {
      return passStyle;
    }
    // At this point we know that specimen is well formed
    // as a tagged record, which is defined at the marshal level of abstraction,
    // since `passStyleOf` checks those invariants.
    if (tagMemo.has(specimen)) {
      return tagMemo.get(specimen);
    }
    const tag = getTag(specimen);
    if (confirmTagged(specimen, tag, reject)) {
      tagMemo.set(specimen, tag);
      return tag;
    }
    reject && reject`cannot check unrecognized tag ${q(tag)}`;
    return undefined;
  };
  harden(confirmKindOf);

  /**
   * @param {any} specimen
   * @returns {Kind | undefined}
   */
  const kindOf = specimen => confirmKindOf(specimen, false);
  harden(kindOf);

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {any} specimen
   * @param {Kind} kind
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmKind = (specimen, kind, reject) => {
    // check null and undefined as Keys
    if (singletonKinds.has(kind)) {
      // eslint-disable-next-line no-use-before-define
      return confirmAsKeyPatt(specimen, singletonKinds.get(kind), reject);
    }

    const realKind = confirmKindOf(specimen, reject);
    if (kind === realKind) {
      return true;
    }
    // `kind` and `realKind` can be embedded without quotes
    // because they are drawn from the enumerated collection of known Kinds.
    return reject && reject`${b(realKind)} ${specimen} - Must be a ${b(kind)}`;
  };

  /**
   * Checks only recognized kinds, and only if the specimen
   * passes the invariants associated with that recognition.
   *
   * @param {any} specimen
   * @param {Kind} kind
   * @returns {boolean}
   */
  const isKind = (specimen, kind) => confirmKind(specimen, kind, false);

  /**
   * Checks if a pattern matches only `undefined`.
   *
   * @param {any} patt
   * @returns {boolean}
   */
  const isUndefinedPatt = patt =>
    patt === undefined ||
    (isKind(patt, 'match:kind') && patt.payload === 'undefined');

  /**
   * @param {any} specimen
   * @param {Key} keyAsPattern
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmAsKeyPatt = (specimen, keyAsPattern, reject) => {
    if (isKey(specimen) && keyEQ(specimen, keyAsPattern)) {
      return true;
    }
    return (
      // When the mismatch occurs against a key used as a pattern,
      // the pattern should still be redacted.
      reject && reject`${specimen} - Must be: ${keyAsPattern}`
    );
  };

  // /////////////////////// isPattern /////////////////////////////////////////

  /** @type {ConfirmPattern} */
  const confirmPattern = (patt, reject) => {
    if (isKey(patt)) {
      // All keys are patterns. For these, the keyMemo will do.
      // All primitives that are patterns are also keys, which this
      // also takes care of without memo. The rest of our checking logic
      // is only concerned with non-key patterns.
      return true;
    }
    if (patternMemo.has(patt)) {
      return true;
    }
    // eslint-disable-next-line no-use-before-define
    const result = confirmPatternInternal(patt, reject);
    if (result) {
      patternMemo.add(patt);
    }
    return result;
  };

  /**
   * @param {Passable} patt - known not to be a key, and therefore known
   * not to be primitive.
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmPatternInternal = (patt, reject) => {
    // Purposely parallels chonfirmKey. TODO reuse more logic between them.
    // Most of the text of the switch below not dealing with matchers is
    // essentially identical.
    const checkIt = child => confirmPattern(child, reject);

    const kind = confirmKindOf(patt, reject);
    switch (kind) {
      case undefined: {
        return false;
      }
      case 'copyRecord': {
        // A copyRecord is a pattern iff all its children are
        // patterns
        return values(patt).every(checkIt);
      }
      case 'copyArray': {
        // A copyArray is a pattern iff all its children are
        // patterns
        return patt.every(checkIt);
      }
      case 'copyMap': {
        // A copyMap's keys are keys and therefore already known to be
        // patterns.
        // A copyMap is a pattern if its values are patterns.
        return confirmPattern(patt.values, reject);
      }
      case 'error':
      case 'promise': {
        return reject && reject`A ${q(kind)} cannot be a pattern`;
      }
      default: {
        if (maybeMatchHelper(kind) !== undefined) {
          return true;
        }
        return (
          reject &&
          reject`A passable of kind ${q(kind)} is not a pattern: ${patt}`
        );
      }
    }
  };

  /**
   * @param {Passable} patt
   * @returns {boolean}
   */
  const isPattern = patt => confirmPattern(patt, false);

  /**
   * @param {Pattern} patt
   */
  const assertPattern = patt => {
    confirmPattern(patt, Fail);
  };

  // /////////////////////// matches ///////////////////////////////////////////

  /**
   * @param {any} specimen
   * @param {Pattern} pattern
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmMatches = (specimen, pattern, reject) =>
    // eslint-disable-next-line no-use-before-define
    confirmMatchesInternal(specimen, pattern, reject);
  hideAndHardenFunction(confirmMatches);

  /**
   * @param {any} specimen
   * @param {Pattern} patt
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmMatchesInternal = (specimen, patt, reject) => {
    // If `patt` does not have a kind (or is not a pattern)
    // then, even if `reject === false`, we should throw about
    // `patt` anyway.
    const patternKind = confirmKindOf(patt, Fail);
    const specimenKind = kindOf(specimen); // may be undefined
    switch (patternKind) {
      case undefined: {
        return reject && reject`pattern expected: ${patt}`;
      }
      case 'promise': {
        return reject && reject`promises cannot be patterns: ${patt}`;
      }
      case 'error': {
        return reject && reject`errors cannot be patterns: ${patt}`;
      }
      case 'undefined':
      case 'null':
      case 'boolean':
      case 'number':
      case 'bigint':
      case 'string':
      case 'symbol':
      case 'byteArray':
      case 'copySet':
      case 'copyBag':
      case 'remotable': {
        // These kinds are necessarily keys
        return confirmAsKeyPatt(specimen, patt, reject);
      }
      case 'copyArray': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyArray') {
          return (
            reject &&
            reject`${specimen} - Must be a copyArray to match a copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        const { length } = patt;
        if (specimen.length !== length) {
          return (
            reject &&
            reject`Array ${specimen} - Must be as long as copyArray pattern: ${qp(
              patt,
            )}`
          );
        }
        return patt.every((p, i) =>
          // eslint-disable-next-line no-use-before-define
          confirmNestedMatches(specimen[i], p, i, reject),
        );
      }
      case 'copyRecord': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyRecord') {
          return (
            reject &&
            reject`${specimen} - Must be a copyRecord to match a copyRecord pattern: ${qp(
              patt,
            )}`
          );
        }
        // TODO Detect and accumulate difference in one pass.
        // Rather than using two calls to `listDifference` to detect and
        // report if and how these lists differ, since they are already
        // in sorted order, we should instead use an algorithm like
        // `iterDisjointUnion` from merge-sort-operators.js
        const specimenNames = recordNames(specimen);
        const pattNames = recordNames(patt);
        const missing = listDifference(pattNames, specimenNames);
        if (missing.length >= 1) {
          return (
            reject &&
            reject`${specimen} - Must have missing properties ${q(missing)}`
          );
        }
        const unexpected = listDifference(specimenNames, pattNames);
        if (unexpected.length >= 1) {
          return (
            reject &&
            reject`${specimen} - Must not have unexpected properties: ${q(
              unexpected,
            )}`
          );
        }
        const specimenValues = recordValues(specimen, specimenNames);
        const pattValues = recordValues(patt, pattNames);
        return pattNames.every((label, i) =>
          // eslint-disable-next-line no-use-before-define
          confirmNestedMatches(specimenValues[i], pattValues[i], label, reject),
        );
      }
      case 'copyMap': {
        if (isKey(patt)) {
          // Takes care of patterns which are keys, so the rest of this
          // logic can assume patterns that are not keys.
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        if (specimenKind !== 'copyMap') {
          return (
            reject &&
            reject`${specimen} - Must be a copyMap to match a copyMap pattern: ${qp(
              patt,
            )}`
          );
        }
        // Compare keys as copySets
        const pattKeySet = copyMapKeySet(patt);
        const specimenKeySet = copyMapKeySet(specimen);
        if (!confirmMatches(specimenKeySet, pattKeySet, reject)) {
          return false;
        }
        // Compare values as copyArrays after applying a shared total order.
        // This is necessary because the antiRankOrder sorting of each map's
        // entries is a preorder that admits ties.
        const pattValues = [];
        const specimenValues = [];
        const entryPairs = generateCollectionPairEntries(
          patt,
          specimen,
          getCopyMapEntryArray,
          undefined,
        );
        for (const [_key, pattValue, specimenValue] of entryPairs) {
          pattValues.push(pattValue);
          specimenValues.push(specimenValue);
        }
        return confirmMatches(
          harden(specimenValues),
          harden(pattValues),
          reject,
        );
      }
      default: {
        const matchHelper = maybeMatchHelper(patternKind);
        if (matchHelper) {
          return matchHelper.confirmMatches(specimen, patt.payload, reject);
        }
        throw Fail`internal: should have recognized ${q(patternKind)} `;
      }
    }
  };

  /**
   * @param {any} specimen
   * @param {Pattern} pattern
   * @param {string} prefix
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmNestedMatches = (specimen, pattern, prefix, reject) =>
    applyLabelingError(confirmMatches, [specimen, pattern, reject], prefix);

  /**
   * @param {any} specimen
   * @param {Pattern} patt
   * @returns {boolean}
   */
  const matches = (specimen, patt) => confirmMatches(specimen, patt, false);

  /**
   * Returning normally indicates success. Match failure is indicated by
   * throwing.
   *
   * @param {any} specimen
   * @param {Pattern} patt
   * @param {string|number|bigint} [label]
   */
  const mustMatch = (specimen, patt, label = undefined) => {
    let innerError;
    try {
      if (confirmMatches(specimen, patt, false)) {
        return;
      }
    } catch (er) {
      innerError = er;
    }
    // should only throw
    confirmNestedMatches(specimen, patt, label, Fail);
    const outerError = makeError(
      X`internal: ${label}: inconsistent pattern match: ${qp(patt)}`,
    );
    if (innerError !== undefined) {
      annotateError(outerError, X`caused by ${innerError}`);
    }
    throw outerError;
  };

  // /////////////////////// getRankCover //////////////////////////////////////

  /** @type {GetRankCover} */
  const getRankCover = (patt, encodePassable) => {
    if (isKey(patt)) {
      const encoded = encodePassable(patt);
      if (encoded !== undefined) {
        return [encoded, `${encoded}~`];
      }
    }
    const passStyle = passStyleOf(patt);
    switch (passStyle) {
      case 'copyArray': {
        // XXX this doesn't get along with the world of cover === pair of
        // strings. In the meantime, fall through to the default which
        // returns a cover that covers all copyArrays.
        //
        // const rankCovers = patt.map(p => getRankCover(p, encodePassable));
        // return harden([
        //   rankCovers.map(([left, _right]) => left),
        //   rankCovers.map(([_left, right]) => right),
        // ]);
        break;
      }
      case 'copyRecord': {
        // XXX this doesn't get along with the world of cover === pair of
        // strings. In the meantime, fall through to the default which
        // returns a cover that covers all copyRecords.
        //
        // const pattKeys = ownKeys(patt);
        // const pattEntries = harden(pattKeys.map(key => [key, patt[key]]));
        // const [leftEntriesLimit, rightEntriesLimit] =
        //   getRankCover(pattEntries);
        // return harden([
        //   fromUniqueEntries(leftEntriesLimit),
        //   fromUniqueEntries(rightEntriesLimit),
        // ]);
        break;
      }
      case 'tagged': {
        const tag = getTag(patt);
        const matchHelper = maybeMatchHelper(tag);
        if (matchHelper) {
          // Buried here is the important case, where we process
          // the various patternNodes
          return matchHelper.getRankCover(patt.payload, encodePassable);
        }
        switch (tag) {
          case 'copySet': {
            // XXX this doesn't get along with the world of cover === pair of
            // strings. In the meantime, fall through to the default which
            // returns a cover that covers all copySets.
            //
            // // Should already be validated by checkPattern. But because this
            // // is a check that may loosen over time, we also assert
            // // everywhere we still rely on the restriction.
            // ```js
            // patt.payload.length === 1 ||
            //   Fail`Non-singleton copySets with matcher not yet implemented: ${patt}`;
            // ```
            //
            // const [leftElementLimit, rightElementLimit] = getRankCover(
            //   patt.payload[0],
            // );
            // return harden([
            //   makeCopySet([leftElementLimit]),
            //   makeCopySet([rightElementLimit]),
            // ]);
            break;
          }
          case 'copyMap': {
            // XXX this doesn't get along with the world of cover === pair of
            // strings. In the meantime, fall through to the default which
            // returns a cover that covers all copyMaps.
            //
            // // A matching copyMap must have the same keys, or at most one
            // // non-key key pattern. Thus we can assume that value positions
            // // match 1-to-1.
            // //
            // // TODO I may be overlooking that the less precise rankOrder
            // // equivalence class may cause values to be out of order,
            // // making this rankCover not actually cover. In that case, for
            // // all the values for keys at the same rank, we should union their
            // // rank covers. TODO POSSIBLE SILENT CORRECTNESS BUG
            // //
            // // If this is a bug, it probably affects the getRankCover
            // // cases of matchLTEHelper and matchGTEHelper on copyMap as
            // // well. See makeCopyMap for an idea on fixing
            // // this bug.
            // const [leftPayloadLimit, rightPayloadLimit] = getRankCover(
            //   patt.payload,
            //   encodePassable,
            // );
            // return harden([
            //   makeTagged('copyMap', leftPayloadLimit),
            //   makeTagged('copyMap', rightPayloadLimit),
            // ]);
            break;
          }
          default: {
            break; // fall through to default
          }
        }
        break; // fall through to default
      }
      default: {
        break; // fall through to default
      }
    }
    return getPassStyleCover(passStyle);
  };

  /**
   * @param {Passable[]} array
   * @param {Pattern} patt
   * @param {string} labelPrefix
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const confirmArrayEveryMatchPattern = (array, patt, labelPrefix, reject) => {
    if (isKind(patt, 'match:any')) {
      // if the pattern is M.any(), we know its true
      return true;
    }
    return array.every((el, i) =>
      confirmNestedMatches(el, patt, `${labelPrefix}[${i}]`, reject),
    );
  };

  // /////////////////////// Match Helpers /////////////////////////////////////

  /** @type {MatchHelper} */
  const matchAnyHelper = Far('match:any helper', {
    confirmMatches: (_specimen, _matcherPayload, _reject) => true,

    confirmIsWellFormed: (matcherPayload, reject) =>
      matcherPayload === undefined ||
      (reject &&
        reject`match:any payload: ${matcherPayload} - Must be undefined`),

    getRankCover: (_matchPayload, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchAndHelper = Far('match:and helper', {
    confirmMatches: (specimen, patts, reject) => {
      return patts.every(patt => confirmMatches(specimen, patt, reject));
    },

    confirmIsWellFormed: (allegedPatts, reject) => {
      const checkIt = patt => confirmPattern(patt, reject);
      return (
        (passStyleOf(allegedPatts) === 'copyArray' ||
          (reject &&
            reject`Needs array of sub-patterns: ${qp(allegedPatts)}`)) &&
        allegedPatts.every(checkIt)
      );
    },

    getRankCover: (patts, encodePassable) =>
      intersectRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchOrHelper = Far('match:or helper', {
    confirmMatches: (specimen, patts, reject) => {
      const { length } = patts;
      if (length === 0) {
        return (
          reject &&
          reject`${specimen} - no pattern disjuncts to match: ${qp(patts)}`
        );
      }
      // Special case disjunctions representing a single optional pattern for
      // better error messages.
      const binaryUndefPattIdx =
        patts.length === 2
          ? patts.findIndex(patt => isUndefinedPatt(patt))
          : -1;
      if (binaryUndefPattIdx !== -1) {
        return (
          specimen === undefined ||
          confirmMatches(specimen, patts[1 - binaryUndefPattIdx], reject)
        );
      }
      if (patts.some(patt => matches(specimen, patt))) {
        return true;
      }
      return reject && reject`${specimen} - Must match one of ${qp(patts)}`;
    },

    confirmIsWellFormed: matchAndHelper.confirmIsWellFormed,

    getRankCover: (patts, encodePassable) =>
      unionRankCovers(
        compareRank,
        patts.map(p => getRankCover(p, encodePassable)),
      ),
  });

  /** @type {MatchHelper} */
  const matchNotHelper = Far('match:not helper', {
    confirmMatches: (specimen, patt, reject) => {
      if (matches(specimen, patt)) {
        return (
          reject && reject`${specimen} - Must fail negated pattern: ${qp(patt)}`
        );
      } else {
        return true;
      }
    },

    confirmIsWellFormed: confirmPattern,

    getRankCover: (_patt, _encodePassable) => ['', '{'],
  });

  /** @type {MatchHelper} */
  const matchScalarHelper = Far('match:scalar helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmScalarKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKeyHelper = Far('match:key helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmKey(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchPatternHelper = Far('match:pattern helper', {
    confirmMatches: (specimen, _matcherPayload, reject) =>
      confirmPattern(specimen, reject),

    confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,

    getRankCover: (_matchPayload, _encodePassable) => ['a', 'z~'],
  });

  /** @type {MatchHelper} */
  const matchKindHelper = Far('match:kind helper', {
    confirmMatches: confirmKind,

    confirmIsWellFormed: (allegedKeyKind, reject) =>
      typeof allegedKeyKind === 'string' ||
      (reject &&
        reject`match:kind: payload: ${allegedKeyKind} - A kind name must be a string`),

    getRankCover: (kind, _encodePassable) => {
      let style;
      switch (kind) {
        case 'copySet':
        case 'copyMap': {
          style = 'tagged';
          break;
        }
        default: {
          style = kind;
          break;
        }
      }
      return getPassStyleCover(style);
    },
  });

  /** @type {MatchHelper} */
  const matchTaggedHelper = Far('match:tagged helper', {
    confirmMatches: (specimen, [tagPatt, payloadPatt], reject) => {
      if (passStyleOf(specimen) !== 'tagged') {
        return (
          reject &&
          reject`Expected tagged object, not ${q(
            passStyleOf(specimen),
          )}: ${specimen}`
        );
      }
      return (
        confirmNestedMatches(getTag(specimen), tagPatt, 'tag', reject) &&
        confirmNestedMatches(specimen.payload, payloadPatt, 'payload', reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmNestedMatches(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:tagged payload',
        reject,
      ),

    getRankCover: (_kind, _encodePassable) => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBigintHelper = Far('match:bigint helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { decimalDigitsLimit } = limit(limits);
      return (
        confirmKind(specimen, 'bigint', reject) &&
        confirmDecimalDigitsLimit(specimen, decimalDigitsLimit, reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:bigint payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchNatHelper = Far('match:nat helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { decimalDigitsLimit } = limit(limits);
      const typedSpecimen = /** @type {bigint} */ (specimen);
      return (
        confirmKind(specimen, 'bigint', reject) &&
        (typedSpecimen >= 0n ||
          (reject && reject`${typedSpecimen} - Must be non-negative`)) &&
        confirmDecimalDigitsLimit(typedSpecimen, decimalDigitsLimit, reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:nat payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      // TODO Could be more precise
      getPassStyleCover('bigint'),
  });

  /** @type {MatchHelper} */
  const matchStringHelper = Far('match:string helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { stringLengthLimit } = limit(limits);
      const typedSpecimen = /** @type {string} */ (specimen);
      return (
        confirmKind(specimen, 'string', reject) &&
        (typedSpecimen.length <= stringLengthLimit ||
          (reject &&
            reject`string ${typedSpecimen} must not be bigger than ${stringLengthLimit}`))
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:string payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('string'),
  });

  /** @type {MatchHelper} */
  const matchSymbolHelper = Far('match:symbol helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { symbolNameLengthLimit } = limit(limits);
      if (!confirmKind(specimen, 'symbol', reject)) {
        return false;
      }
      const symbolName = nameForPassableSymbol(specimen);

      if (typeof symbolName !== 'string') {
        throw Fail`internal: Passable symbol ${specimen} must have a passable name`;
      }
      return (
        symbolName.length <= symbolNameLengthLimit ||
        (reject &&
          reject`Symbol name ${q(
            symbolName,
          )} must not be bigger than ${symbolNameLengthLimit}`)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:symbol payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('symbol'),
  });

  /** @type {MatchHelper} */
  const matchRemotableHelper = Far('match:remotable helper', {
    confirmMatches: (specimen, remotableDesc, reject) => {
      if (isKind(specimen, 'remotable')) {
        return true;
      }
      if (!reject) {
        return false;
      }
      const { label } = remotableDesc;
      const passStyle = passStyleOf(specimen);
      const kindDetails =
        passStyle !== 'tagged'
          ? // Pass style can be embedded in details without quotes.
            b(passStyle)
          : // Tag must be quoted because it is potentially attacker-controlled
            // (unlike `kindOf`, this does not reject unrecognized tags).
            q(getTag(specimen));
      return (
        reject &&
        reject`${specimen} - Must be a remotable ${b(label)}, not ${kindDetails}`
      );
    },

    confirmIsWellFormed: (allegedRemotableDesc, reject) =>
      confirmNestedMatches(
        allegedRemotableDesc,
        harden({ label: MM.string() }),
        'match:remotable payload',
        reject,
      ),

    getRankCover: (_remotableDesc, _encodePassable) =>
      getPassStyleCover('remotable'),
  });

  /** @type {MatchHelper} */
  const matchLTEHelper = Far('match:lte helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyLTE(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be <= ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: (rightOperand, encodePassable) => {
      const passStyle = passStyleOf(rightOperand);
      // The prefer-const makes no sense when some of the variables need
      // to be `let`
      // eslint-disable-next-line prefer-const
      let [leftBound, rightBound] = getPassStyleCover(passStyle);
      const newRightBound = `${encodePassable(rightOperand)}~`;
      if (newRightBound !== undefined) {
        rightBound = newRightBound;
      }
      return [leftBound, rightBound];
    },
  });

  /** @type {MatchHelper} */
  const matchLTHelper = Far('match:lt helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyLT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be < ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchLTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchGTEHelper = Far('match:gte helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyGTE(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be >= ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: (rightOperand, encodePassable) => {
      const passStyle = passStyleOf(rightOperand);
      // The prefer-const makes no sense when some of the variables need
      // to be `let`
      // eslint-disable-next-line prefer-const
      let [leftBound, rightBound] = getPassStyleCover(passStyle);
      const newLeftBound = encodePassable(rightOperand);
      if (newLeftBound !== undefined) {
        leftBound = newLeftBound;
      }
      return [leftBound, rightBound];
    },
  });

  /** @type {MatchHelper} */
  const matchGTHelper = Far('match:gt helper', {
    confirmMatches: (specimen, rightOperand, reject) =>
      keyGT(specimen, rightOperand) ||
      (reject && reject`${specimen} - Must be > ${rightOperand}`),

    confirmIsWellFormed: confirmKey,

    getRankCover: matchGTEHelper.getRankCover,
  });

  /** @type {MatchHelper} */
  const matchRecordOfHelper = Far('match:recordOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      reject,
    ) => {
      const { numPropertiesLimit, propertyNameLengthLimit } = limit(limits);
      return (
        confirmKind(specimen, 'copyRecord', reject) &&
        (ownKeys(specimen).length <= numPropertiesLimit ||
          (reject &&
            reject`Must not have more than ${q(
              numPropertiesLimit,
            )} properties: ${specimen}`)) &&
        entries(specimen).every(
          ([key, value]) =>
            (key.length <= propertyNameLengthLimit ||
              (reject &&
                applyLabelingError(
                  () =>
                    reject`Property name must not be longer than ${q(
                      propertyNameLengthLimit,
                    )}`,
                  [],
                  key,
                ))) &&
            confirmNestedMatches(
              harden([key, value]),
              harden([keyPatt, valuePatt]),
              key,
              reject,
            ),
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:recordOf payload',
        reject,
      ),

    getRankCover: _entryPatt => getPassStyleCover('copyRecord'),
  });

  /** @type {MatchHelper} */
  const matchArrayOfHelper = Far('match:arrayOf helper', {
    confirmMatches: (specimen, [subPatt, limits = undefined], reject) => {
      const { arrayLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        confirmKind(specimen, 'copyArray', reject) &&
        (/** @type {Array} */ (specimen).length <= arrayLengthLimit ||
          reject && reject`Array length ${specimen.length} must be <= limit ${arrayLengthLimit}`) &&
        confirmArrayEveryMatchPattern(specimen, subPatt, '', reject)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        'match:arrayOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('copyArray'),
  });

  /** @type {MatchHelper} */
  const matchByteArrayHelper = Far('match:byteArray helper', {
    confirmMatches: (specimen, [limits = undefined], reject) => {
      const { byteLengthLimit } = limit(limits);
      // prettier-ignore
      return (
        confirmKind(specimen, 'byteArray', reject) &&
        (/** @type {ArrayBuffer} */ (specimen).byteLength <= byteLengthLimit ||
          reject && reject`byteArray ${specimen} must not be bigger than ${byteLengthLimit}`)
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([]),
        'match:byteArray payload',
        reject,
      ),

    getRankCover: (_matchPayload, _encodePassable) =>
      getPassStyleCover('byteArray'),
  });

  /** @type {MatchHelper} */
  const matchSetOfHelper = Far('match:setOf helper', {
    confirmMatches: (specimen, [keyPatt, limits = undefined], reject) => {
      const { numSetElementsLimit } = limit(limits);
      return (
        ((confirmKind(specimen, 'copySet', reject) &&
          /** @type {Array} */ (specimen.payload).length <
            numSetElementsLimit) ||
          (reject &&
            reject`Set must not have more than ${q(numSetElementsLimit)} elements: ${
              specimen.payload.length
            }`)) &&
        confirmArrayEveryMatchPattern(
          specimen.payload,
          keyPatt,
          'set elements',
          reject,
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern()]),
        'match:setOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchBagOfHelper = Far('match:bagOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, countPatt, limits = undefined],
      reject,
    ) => {
      const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
      return (
        ((confirmKind(specimen, 'copyBag', reject) &&
          /** @type {Array} */ (specimen.payload).length <=
            numUniqueBagElementsLimit) ||
          (reject &&
            reject`Bag must not have more than ${q(
              numUniqueBagElementsLimit,
            )} unique elements: ${specimen}`)) &&
        specimen.payload.every(
          ([key, count], i) =>
            confirmNestedMatches(key, keyPatt, `bag keys[${i}]`, reject) &&
            applyLabelingError(
              () =>
                confirmDecimalDigitsLimit(count, decimalDigitsLimit, reject) &&
                confirmMatches(count, countPatt, reject),
              [],
              `bag counts[${i}]`,
            ),
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:bagOf payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /**
   * @template {Passable} [T=Passable]
   * @param {CopyArray<T>} elements
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {T[] | undefined} inResults
   * @param {T[] | undefined} outResults
   * @param {-1 | 1} direction -1 for picking from the end (which gives
   * intuitive results with descending lexicographic CopySet/CopyBag payloads);
   * 1 for picking from the start (which gives intuitive results with other
   * arrays)
   * @returns {boolean}
   */
  const confirmElementsHasSplit = (
    elements,
    elementPatt,
    bound,
    reject,
    inResults,
    outResults,
    direction,
  ) => {
    let inCount = 0n;
    const firstIndex = direction === -1 ? elements.length - 1 : 0;
    const stopIndex = direction === -1 ? -1 : elements.length;
    for (let i = firstIndex; i !== stopIndex; i += direction) {
      const element = elements[i];
      if (inCount >= bound) {
        if (!outResults) break;
        outResults.push(element);
      } else if (matches(element, elementPatt)) {
        inCount += 1n;
        if (inResults) inResults.push(element);
      } else if (outResults) {
        outResults.push(element);
      }
    }
    return (
      inCount >= bound ||
      (reject && reject`Has only ${q(inCount)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   * @param {CopyArray<[Key, bigint]>} pairs in descending lexicographic order
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {[Key, bigint][]} [inResults]
   * @param {[Key, bigint][]} [outResults]
   * @returns {boolean}
   */
  const pairsHasSplit = (
    pairs,
    elementPatt,
    bound,
    reject,
    inResults = undefined,
    outResults = undefined,
  ) => {
    let inCount = 0n;
    // To produce intuitive results with CopyBag payloads (which are ordered by
    // descending lexicographic Key order), we iterate by reverse array index
    // and therefore consider elements in *ascending* lexicographic Key order.
    for (let i = pairs.length - 1; i >= 0; i -= 1) {
      const [element, num] = pairs[i];
      const stillNeeds = bound - inCount;
      if (stillNeeds <= 0n) {
        if (!outResults) break;
        outResults.push([element, num]);
      } else if (matches(element, elementPatt)) {
        const isPartial = num > stillNeeds;
        const numTake = isPartial ? stillNeeds : num;
        inCount += numTake;
        if (inResults) inResults.push([element, numTake]);
        if (isPartial && outResults) outResults.push([element, num - numTake]);
      } else if (outResults) {
        outResults.push([element, num]);
      }
    }
    return (
      inCount >= bound ||
      (reject && reject`Has only ${q(inCount)} matches, but needs ${q(bound)}`)
    );
  };

  /**
   * Confirms that `specimen` contains at least `bound` instances of an element
   * matched by `elementPatt`, optionally returning those bounded matches and/or
   * their complement as specified by `needInResults` and `needOutResults`
   * (considering CopyArray elements by ascending index and CopySet/CopyBag
   * elements in lexicographic order).
   * Note that CopyBag elements can be split; when only some of the count
   * associated with a single Key is necessary to bring cumulative matches up to
   * `bound`, the rest of that count is not considered to be matching.
   * If the specimen does not contain enough matching instances, this function
   * terminates as directed by `reject` (i.e., either returning `false` or
   * throwing an error).
   *
   * @typedef {CopyArray | CopySet | CopyBag} Container
   * @param {Container} specimen
   * @param {Pattern} elementPatt
   * @param {bigint} bound Must be >= 1n
   * @param {Rejector} reject
   * @param {boolean} [needInResults] collect and return matches inside a
   *   container of the same shape as `specimen`
   * @param {boolean} [needOutResults] collect and return rejects inside a
   *   container of the same shape as `specimen`
   * @returns {[matches: Container | undefined, discards: Container | undefined] | false}
   */
  const containerHasSplit = (
    specimen,
    elementPatt,
    bound,
    reject,
    needInResults = false,
    needOutResults = false,
  ) => {
    const inResults = needInResults ? [] : undefined;
    const outResults = needOutResults ? [] : undefined;
    const kind = kindOf(specimen);
    switch (kind) {
      case 'copyArray': {
        return (
          confirmElementsHasSplit(
            specimen,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            1,
          ) && harden([inResults, outResults])
        );
      }
      case 'copySet': {
        return (
          confirmElementsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            -1,
          ) &&
          harden([
            inResults && makeCopySet(inResults),
            outResults && makeCopySet(outResults),
          ])
        );
      }
      case 'copyBag': {
        return (
          pairsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
          ) &&
          harden([
            inResults && makeCopyBag(inResults),
            outResults && makeCopyBag(outResults),
          ])
        );
      }
      default: {
        return reject && reject`unexpected ${q(kind)}`;
      }
    }
  };

  /** @type {MatchHelper} */
  const matchContainerHasHelper = Far('M.containerHas helper', {
    /**
     * @param {CopyArray | CopySet | CopyBag} specimen
     * @param {[Pattern, bigint, Limits?]} payload
     * @param {Rejector} reject
     */
    confirmMatches: (
      specimen,
      [elementPatt, bound, limits = undefined],
      reject,
    ) => {
      const kind = confirmKindOf(specimen, reject);
      const { decimalDigitsLimit } = limit(limits);
      if (
        !applyLabelingError(
          confirmDecimalDigitsLimit,
          [bound, decimalDigitsLimit, reject],
          `${kind} matches`,
        )
      ) {
        return false;
      }
      return !!containerHasSplit(specimen, elementPatt, bound, reject);
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.gte(1n)]),
        'M.containerHas payload',
        reject,
      ),

    getRankCover: () => getPassStyleCover('tagged'),
  });

  /** @type {MatchHelper} */
  const matchMapOfHelper = Far('match:mapOf helper', {
    confirmMatches: (
      specimen,
      [keyPatt, valuePatt, limits = undefined],
      reject,
    ) => {
      const { numMapEntriesLimit } = limit(limits);
      return (
        confirmKind(specimen, 'copyMap', reject) &&
        // eslint-disable-next-line @endo/restrict-comparison-operands
        (specimen.payload.keys.length <= numMapEntriesLimit ||
          (reject &&
            reject`CopyMap must have no more than ${q(
              numMapEntriesLimit,
            )} entries: ${specimen}`)) &&
        confirmArrayEveryMatchPattern(
          specimen.payload.keys,
          keyPatt,
          'map keys',
          reject,
        ) &&
        confirmArrayEveryMatchPattern(
          specimen.payload.values,
          valuePatt,
          'map values',
          reject,
        )
      );
    },

    confirmIsWellFormed: (payload, reject) =>
      confirmIsWellFormedWithLimit(
        payload,
        harden([MM.pattern(), MM.pattern()]),
        'match:mapOf payload',
        reject,
      ),

    getRankCover: _entryPatt => getPassStyleCover('tagged'),
  });

  /**
   * @param {Passable[]} specimen
   * @param {Pattern[]} requiredPatt
   * @param {Pattern[]} optionalPatt
   * @returns {{
   *   requiredSpecimen: Passable[],
   *   optionalSpecimen: Passable[],
   *   restSpecimen: Passable[]
   * }}
   */
  const splitArrayParts = (specimen, requiredPatt, optionalPatt) => {
    const numRequired = requiredPatt.length;
    const numOptional = optionalPatt.length;
    const requiredSpecimen = specimen.slice(0, numRequired);
    const optionalSpecimen = specimen.slice(
      numRequired,
      numRequired + numOptional,
    );
    const restSpecimen = specimen.slice(numRequired + numOptional);
    return harden({ requiredSpecimen, optionalSpecimen, restSpecimen });
  };

  /**
   * Optional specimen elements which are `undefined` pass unconditionally.
   * We encode this with the `M.or` pattern so it also produces a good
   * compression distinguishing `undefined` from absence.
   *
   * @param {Pattern[]} optionalPatt
   * @param {number} length
   * @returns {Pattern[]} The partialPatt
   */
  const adaptArrayPattern = (optionalPatt, length) =>
    harden(optionalPatt.slice(0, length).map(patt => MM.opt(patt)));

  /** @type {MatchHelper} */
  const matchSplitArrayHelper = Far('match:splitArray helper', {
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = [], restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyArray', reject)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitArrayParts(specimen, requiredPatt, optionalPatt);
      const partialPatt = adaptArrayPattern(
        optionalPatt,
        optionalSpecimen.length,
      );
      let argNum = 0;
      return (
        (requiredSpecimen.length === requiredPatt.length ||
          (reject &&
            reject`Expected at least ${q(
              requiredPatt.length,
            )} arguments: ${specimen}`)) &&
        requiredPatt.every((p, i) =>
          confirmNestedMatches(
            requiredSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}`,
            reject,
          ),
        ) &&
        partialPatt.every((p, i) =>
          confirmNestedMatches(
            optionalSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}?`,
            reject,
          ),
        ) &&
        confirmNestedMatches(restSpecimen, restPatt, '...rest', reject)
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Rejector} reject
     */
    confirmIsWellFormed: (splitArray, reject) => {
      if (
        passStyleOf(splitArray) === 'copyArray' &&
        (splitArray.length >= 1 || splitArray.length <= 3)
      ) {
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          splitArray;
        if (
          isPattern(requiredPatt) &&
          passStyleOf(requiredPatt) === 'copyArray' &&
          (optionalPatt === undefined ||
            (isPattern(optionalPatt) &&
              passStyleOf(optionalPatt) === 'copyArray')) &&
          (restPatt === undefined || isPattern(restPatt))
        ) {
          return true;
        }
      }
      return (
        reject &&
        reject`Must be an array of a requiredPatt array, an optional optionalPatt array, and an optional restPatt: ${q(
          splitArray,
        )}`
      );
    },

    getRankCover: ([
      _requiredPatt,
      _optionalPatt = undefined,
      _restPatt = undefined,
    ]) => getPassStyleCover('copyArray'),
  });

  /**
   * @param {CopyRecord<Passable>} specimen
   * @param {CopyRecord<Pattern>} requiredPatt
   * @param {CopyRecord<Pattern>} optionalPatt
   * @returns {{
   *   requiredSpecimen: CopyRecord<Passable>,
   *   optionalSpecimen: CopyRecord<Passable>,
   *   restSpecimen: CopyRecord<Passable>
   * }}
   */
  const splitRecordParts = (specimen, requiredPatt, optionalPatt) => {
    // Not frozen! Mutated in place
    /** @type {[string, Passable][]} */
    const requiredEntries = [];
    /** @type {[string, Passable][]} */
    const optionalEntries = [];
    /** @type {[string, Passable][]} */
    const restEntries = [];
    for (const [name, value] of entries(specimen)) {
      if (hasOwn(requiredPatt, name)) {
        requiredEntries.push([name, value]);
      } else if (hasOwn(optionalPatt, name)) {
        optionalEntries.push([name, value]);
      } else {
        restEntries.push([name, value]);
      }
    }
    return harden({
      requiredSpecimen: fromUniqueEntries(requiredEntries),
      optionalSpecimen: fromUniqueEntries(optionalEntries),
      restSpecimen: fromUniqueEntries(restEntries),
    });
  };

  /**
   * Optional specimen values which are `undefined` pass unconditionally.
   * We encode this with the `M.or` pattern so it also produces a good
   * compression distinguishing `undefined` from absence.
   *
   * @param {CopyRecord<Pattern>} optionalPatt
   * @param {string[]} names
   * @returns {CopyRecord<Pattern>} The partialPatt
   */
  const adaptRecordPattern = (optionalPatt, names) =>
    fromUniqueEntries(names.map(name => [name, MM.opt(optionalPatt[name])]));

  /** @type {MatchHelper} */
  const matchSplitRecordHelper = Far('match:splitRecord helper', {
    confirmMatches: (
      specimen,
      [requiredPatt, optionalPatt = {}, restPatt = MM.any()],
      reject,
    ) => {
      if (!confirmKind(specimen, 'copyRecord', reject)) {
        return false;
      }
      const { requiredSpecimen, optionalSpecimen, restSpecimen } =
        splitRecordParts(specimen, requiredPatt, optionalPatt);

      const partialNames = /** @type {string[]} */ (ownKeys(optionalSpecimen));
      const partialPatt = adaptRecordPattern(optionalPatt, partialNames);
      return (
        confirmMatches(requiredSpecimen, requiredPatt, reject) &&
        partialNames.every(name =>
          confirmNestedMatches(
            optionalSpecimen[name],
            partialPatt[name],
            `${name}?`,
            reject,
          ),
        ) &&
        confirmNestedMatches(restSpecimen, restPatt, '...rest', reject)
      );
    },

    /**
     * @param {Array} splitArray
     * @param {Rejector} reject
     */
    confirmIsWellFormed: (splitArray, reject) => {
      if (
        passStyleOf(splitArray) === 'copyArray' &&
        (splitArray.length >= 1 || splitArray.length <= 3)
      ) {
        const [requiredPatt, optionalPatt = undefined, restPatt = undefined] =
          splitArray;
        if (
          isPattern(requiredPatt) &&
          passStyleOf(requiredPatt) === 'copyRecord' &&
          (optionalPatt === undefined ||
            (isPattern(optionalPatt) &&
              passStyleOf(optionalPatt) === 'copyRecord')) &&
          (restPatt === undefined || isPattern(restPatt))
        ) {
          return true;
        }
      }
      return (
        reject &&
        reject`Must be an array of a requiredPatt record, an optional optionalPatt record, and an optional restPatt: ${q(
          splitArray,
        )}`
      );
    },

    getRankCover: ([
      requiredPatt,
      _optionalPatt = undefined,
      _restPatt = undefined,
    ]) => getPassStyleCover(passStyleOf(requiredPatt)),
  });

  /** @type {Record<string, MatchHelper>} */
  const HelpersByMatchTag = harden({
    'match:any': matchAnyHelper,
    'match:and': matchAndHelper,
    'match:or': matchOrHelper,
    'match:not': matchNotHelper,

    'match:scalar': matchScalarHelper,
    'match:key': matchKeyHelper,
    'match:pattern': matchPatternHelper,
    'match:kind': matchKindHelper,
    'match:tagged': matchTaggedHelper,
    'match:bigint': matchBigintHelper,
    'match:nat': matchNatHelper,
    'match:string': matchStringHelper,
    'match:symbol': matchSymbolHelper,
    'match:remotable': matchRemotableHelper,

    'match:lt': matchLTHelper,
    'match:lte': matchLTEHelper,
    'match:gte': matchGTEHelper,
    'match:gt': matchGTHelper,

    'match:arrayOf': matchArrayOfHelper,
    'match:byteArray': matchByteArrayHelper,
    'match:recordOf': matchRecordOfHelper,
    'match:setOf': matchSetOfHelper,
    'match:bagOf': matchBagOfHelper,
    'match:containerHas': matchContainerHasHelper,
    'match:mapOf': matchMapOfHelper,
    'match:splitArray': matchSplitArrayHelper,
    'match:splitRecord': matchSplitRecordHelper,
  });

  const makeMatcher = (tag, payload) => {
    const matcher = makeTagged(tag, payload);
    assertPattern(matcher);
    return matcher;
  };

  const makeKindMatcher = kind => makeMatcher('match:kind', kind);

  const AnyShape = makeMatcher('match:any', undefined);
  const ScalarShape = makeMatcher('match:scalar', undefined);
  const KeyShape = makeMatcher('match:key', undefined);
  const PatternShape = makeMatcher('match:pattern', undefined);
  const BooleanShape = makeKindMatcher('boolean');
  const NumberShape = makeKindMatcher('number');
  const BigIntShape = makeTagged('match:bigint', []);
  const NatShape = makeTagged('match:nat', []);
  const StringShape = makeTagged('match:string', []);
  const SymbolShape = makeTagged('match:symbol', []);
  const RecordShape = makeTagged('match:recordOf', [AnyShape, AnyShape]);
  const ArrayShape = makeTagged('match:arrayOf', [AnyShape]);
  const ByteArrayShape = makeTagged('match:byteArray', []);
  const SetShape = makeTagged('match:setOf', [AnyShape]);
  const BagShape = makeTagged('match:bagOf', [AnyShape, AnyShape]);
  const MapShape = makeTagged('match:mapOf', [AnyShape, AnyShape]);
  const RemotableShape = makeKindMatcher('remotable');
  const ErrorShape = makeKindMatcher('error');
  const PromiseShape = makeKindMatcher('promise');
  const UndefinedShape = makeKindMatcher('undefined');

  /**
   * For when the last element of the payload is the optional limits,
   * so that when it is `undefined` it is dropped from the end of the
   * payloads array.
   *
   * @param {string} tag
   * @param {Passable[]} payload
   */
  const makeLimitsMatcher = (tag, payload) => {
    if (payload[payload.length - 1] === undefined) {
      payload = harden(payload.slice(0, payload.length - 1));
    }
    return makeMatcher(tag, payload);
  };

  const makeRemotableMatcher = (label = undefined) =>
    label === undefined
      ? RemotableShape
      : makeMatcher('match:remotable', harden({ label }));

  /**
   * @template T
   * @param {T} empty
   * @param {T} base
   * @param {T} [optional]
   * @param {T} [rest]
   * @returns {T[]}
   */
  const makeSplitPayload = (
    empty,
    base,
    optional = undefined,
    rest = undefined,
  ) => {
    if (rest) {
      return [base, optional || empty, rest];
    }
    if (optional) {
      return [base, optional];
    }
    return [base];
  };

  // //////////////////

  /** @type {MatcherNamespace} */
  const M = harden({
    any: () => AnyShape,
    and: (...patts) => makeMatcher('match:and', patts),
    or: (...patts) => makeMatcher('match:or', patts),
    not: subPatt => makeMatcher('match:not', subPatt),

    scalar: () => ScalarShape,
    key: () => KeyShape,
    pattern: () => PatternShape,
    kind: makeKindMatcher,
    tagged: (tagPatt = M.string(), payloadPatt = M.any()) =>
      makeMatcher('match:tagged', harden([tagPatt, payloadPatt])),
    boolean: () => BooleanShape,
    number: () => NumberShape,
    bigint: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:bigint', [limits]) : BigIntShape,
    nat: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:nat', [limits]) : NatShape,
    string: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:string', [limits]) : StringShape,
    symbol: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:symbol', [limits]) : SymbolShape,
    record: (limits = undefined) =>
      limits ? M.recordOf(M.any(), M.any(), limits) : RecordShape,
    // struct: A pattern that matches CopyRecords with a fixed quantity of
    // entries where the values match patterns for corresponding keys is merely
    // a hardened object with patterns in the places of values for
    // corresponding keys.
    // For example, a pattern that matches CopyRecords that have a string value
    // for the key 'x' and a number for the key 'y' is:
    // harden({ x: M.string(), y: M.number() }).
    array: (limits = undefined) =>
      limits ? M.arrayOf(M.any(), limits) : ArrayShape,
    // tuple: A pattern that matches CopyArrays with a fixed quantity of values
    // that match a heterogeneous array of patterns is merely a hardened array
    // of the respective patterns.
    // For example, a pattern that matches CopyArrays of length 2 that have a
    // string at index 0 and a number at index 1 is:
    // harden([ M.string(), M.number() ]).
    byteArray: (limits = undefined) =>
      limits ? makeLimitsMatcher('match:byteArray', [limits]) : ByteArrayShape,
    set: (limits = undefined) => (limits ? M.setOf(M.any(), limits) : SetShape),
    bag: (limits = undefined) =>
      limits ? M.bagOf(M.any(), M.any(), limits) : BagShape,
    map: (limits = undefined) =>
      limits ? M.mapOf(M.any(), M.any(), limits) : MapShape,
    // heterogeneous map: A pattern that matches CopyMaps with a fixed quantity
    // of entries where the value for each key matches a corresponding pattern
    // is merely a (hardened) CopyMap with patterns instead of values for the
    // corresponding keys.
    // For example, a pattern that matches CopyMaps where the value for the key
    // 'x' is a number and the value for the key 'y' is a string is:
    // makeCopyMap([['x', M.number()], ['y', M.string()]]).
    remotable: makeRemotableMatcher,
    error: () => ErrorShape,
    promise: () => PromiseShape,
    undefined: () => UndefinedShape,
    null: () => null,

    lt: rightOperand => makeMatcher('match:lt', rightOperand),
    lte: rightOperand => makeMatcher('match:lte', rightOperand),
    eq: key => {
      assertKey(key);
      return key === undefined ? M.undefined() : key;
    },
    neq: key => M.not(M.eq(key)),
    gte: rightOperand => makeMatcher('match:gte', rightOperand),
    gt: rightOperand => makeMatcher('match:gt', rightOperand),

    recordOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:recordOf', [keyPatt, valuePatt, limits]),
    arrayOf: (subPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:arrayOf', [subPatt, limits]),
    setOf: (keyPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:setOf', [keyPatt, limits]),
    bagOf: (keyPatt = M.any(), countPatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:bagOf', [keyPatt, countPatt, limits]),
    containerHas: (elementPatt = M.any(), countPatt = 1n, limits = undefined) =>
      makeLimitsMatcher('match:containerHas', [elementPatt, countPatt, limits]),
    mapOf: (keyPatt = M.any(), valuePatt = M.any(), limits = undefined) =>
      makeLimitsMatcher('match:mapOf', [keyPatt, valuePatt, limits]),
    splitArray: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        'match:splitArray',
        makeSplitPayload([], base, optional, rest),
      ),
    splitRecord: (base, optional = undefined, rest = undefined) =>
      makeMatcher(
        'match:splitRecord',
        makeSplitPayload({}, base, optional, rest),
      ),
    split: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // TODO at-ts-expect-error works locally but not from @endo/exo
        // @ts-expect-error We know it should be an array
        return M.splitArray(base, rest && [], rest);
      } else {
        return M.splitRecord(base, rest && {}, rest);
      }
    },
    partial: (base, rest = undefined) => {
      if (passStyleOf(harden(base)) === 'copyArray') {
        // TODO at-ts-expect-error works locally but not from @endo/exo
        // @ts-expect-error We know it should be an array
        return M.splitArray([], base, rest);
      } else {
        return M.splitRecord({}, base, rest);
      }
    },

    eref: t => M.or(t, M.promise()),
    opt: t => M.or(M.undefined(), t),

    interface: (interfaceName, methodGuards, options) =>
      // eslint-disable-next-line no-use-before-define
      makeInterfaceGuard(interfaceName, methodGuards, options),
    call: (...argPatterns) =>
      // eslint-disable-next-line no-use-before-define
      makeMethodGuardMaker('sync', argPatterns),
    callWhen: (...argGuards) =>
      // eslint-disable-next-line no-use-before-define
      makeMethodGuardMaker('async', argGuards),

    await: argPattern =>
      // eslint-disable-next-line no-use-before-define
      makeAwaitArgGuard(argPattern),
    raw: () =>
      // eslint-disable-next-line no-use-before-define
      makeRawGuard(),
  });

  return harden({
    confirmMatches,
    confirmLabeledMatches: confirmNestedMatches,
    matches,
    mustMatch,
    assertPattern,
    isPattern,
    getRankCover,
    M,
    kindOf,
    containerHasSplit,
  });
};

// Only include those whose meaning is independent of an imputed sort order
// of remotables, or of encoding of passable as sortable strings. Thus,
// getRankCover is omitted. To get one, you'd need to instantiate
// `makePatternKit()` yourself. Since there are currently no external
// uses of `getRankCover`, for clarity during development, `makePatternKit`
// is not currently exported.
       const {
  confirmMatches,
  confirmLabeledMatches,
  matches,
  mustMatch,
  assertPattern,
  isPattern,
  getRankCover,
  M,
  kindOf,
  containerHasSplit,
} = makePatternKit();$h͏_once.confirmMatches(confirmMatches);$h͏_once.confirmLabeledMatches(confirmLabeledMatches);$h͏_once.matches(matches);$h͏_once.mustMatch(mustMatch);$h͏_once.assertPattern(assertPattern);$h͏_once.isPattern(isPattern);$h͏_once.getRankCover(getRankCover);$h͏_once.M(M);$h͏_once.kindOf(kindOf);$h͏_once.containerHasSplit(containerHasSplit);

MM = M;

// //////////////////////////// Guards ///////////////////////////////////////

// M.await(...)
const AwaitArgGuardPayloadShape = harden({
  argGuard: M.pattern(),
});

       const AwaitArgGuardShape = M.kind('guard:awaitArgGuard');

/**
 * @param {any} specimen
 * @returns {specimen is AwaitArgGuard}
 */$h͏_once.AwaitArgGuardShape(AwaitArgGuardShape);
       const isAwaitArgGuard = specimen =>
  matches(specimen, AwaitArgGuardShape);$h͏_once.isAwaitArgGuard(isAwaitArgGuard);
hideAndHardenFunction(isAwaitArgGuard);

/**
 * @param {any} specimen
 * @returns {asserts specimen is AwaitArgGuard}
 */
       const assertAwaitArgGuard = specimen => {
  mustMatch(specimen, AwaitArgGuardShape, 'awaitArgGuard');
};$h͏_once.assertAwaitArgGuard(assertAwaitArgGuard);
hideAndHardenFunction(assertAwaitArgGuard);

/**
 * @param {Pattern} argPattern
 * @returns {AwaitArgGuard}
 */
const makeAwaitArgGuard = argPattern => {
  /** @type {AwaitArgGuard} */
  const result = makeTagged('guard:awaitArgGuard', {
    argGuard: argPattern,
  });
  assertAwaitArgGuard(result);
  return result;
};

// M.raw()

const RawGuardPayloadShape = M.record();

       const RawGuardShape = M.kind('guard:rawGuard');$h͏_once.RawGuardShape(RawGuardShape);

       const isRawGuard = specimen => matches(specimen, RawGuardShape);$h͏_once.isRawGuard(isRawGuard);

       const assertRawGuard = specimen =>
  mustMatch(specimen, RawGuardShape, 'rawGuard');

/**
 * @returns {RawGuard}
 */$h͏_once.assertRawGuard(assertRawGuard);
const makeRawGuard = () => makeTagged('guard:rawGuard', {});

// M.call(...)
// M.callWhen(...)

       const SyncValueGuardShape = M.or(RawGuardShape, M.pattern());$h͏_once.SyncValueGuardShape(SyncValueGuardShape);

       const SyncValueGuardListShape = M.arrayOf(SyncValueGuardShape);$h͏_once.SyncValueGuardListShape(SyncValueGuardListShape);

const ArgGuardShape = M.or(RawGuardShape, AwaitArgGuardShape, M.pattern());
       const ArgGuardListShape = M.arrayOf(ArgGuardShape);$h͏_once.ArgGuardListShape(ArgGuardListShape);

const SyncMethodGuardPayloadShape = harden({
  callKind: 'sync',
  argGuards: SyncValueGuardListShape,
  optionalArgGuards: M.opt(SyncValueGuardListShape),
  restArgGuard: M.opt(SyncValueGuardShape),
  returnGuard: SyncValueGuardShape,
});

const AsyncMethodGuardPayloadShape = harden({
  callKind: 'async',
  argGuards: ArgGuardListShape,
  optionalArgGuards: M.opt(ArgGuardListShape),
  restArgGuard: M.opt(SyncValueGuardShape),
  returnGuard: SyncValueGuardShape,
});

       const MethodGuardPayloadShape = M.or(
  SyncMethodGuardPayloadShape,
  AsyncMethodGuardPayloadShape,
);$h͏_once.MethodGuardPayloadShape(MethodGuardPayloadShape);

       const MethodGuardShape = M.kind('guard:methodGuard');

/**
 * @param {any} specimen
 * @returns {asserts specimen is MethodGuard}
 */$h͏_once.MethodGuardShape(MethodGuardShape);
       const assertMethodGuard = specimen => {
  mustMatch(specimen, MethodGuardShape, 'methodGuard');
};$h͏_once.assertMethodGuard(assertMethodGuard);
hideAndHardenFunction(assertMethodGuard);

/**
 * @param {'sync'|'async'} callKind
 * @param {ArgGuard[]} argGuards
 * @param {ArgGuard[]} [optionalArgGuards]
 * @param {SyncValueGuard} [restArgGuard]
 * @returns {MethodGuardMaker}
 */
const makeMethodGuardMaker = (
  callKind,
  argGuards,
  optionalArgGuards = undefined,
  restArgGuard = undefined,
) =>
  harden({
    optional: (...optArgGuards) => {
      optionalArgGuards === undefined ||
        Fail`Can only have one set of optional guards`;
      restArgGuard === undefined ||
        Fail`optional arg guards must come before rest arg`;
      return makeMethodGuardMaker(callKind, argGuards, optArgGuards);
    },
    rest: rArgGuard => {
      restArgGuard === undefined || Fail`Can only have one rest arg`;
      return makeMethodGuardMaker(
        callKind,
        argGuards,
        optionalArgGuards,
        rArgGuard,
      );
    },
    returns: (returnGuard = M.undefined()) => {
      /** @type {MethodGuard} */
      const result = makeTagged('guard:methodGuard', {
        callKind,
        argGuards,
        optionalArgGuards,
        restArgGuard,
        returnGuard,
      });
      assertMethodGuard(result);
      return result;
    },
  });

       const InterfaceGuardPayloadShape = M.splitRecord(
  {
    interfaceName: M.string(),
    methodGuards: M.recordOf(M.string(), MethodGuardShape),
  },
  {
    defaultGuards: M.or(M.undefined(), 'passable', 'raw'),
    sloppy: M.boolean(),
    symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape),
  },
);$h͏_once.InterfaceGuardPayloadShape(InterfaceGuardPayloadShape);

       const InterfaceGuardShape = M.kind('guard:interfaceGuard');

/**
 * @param {any} specimen
 * @returns {asserts specimen is InterfaceGuard}
 */$h͏_once.InterfaceGuardShape(InterfaceGuardShape);
       const assertInterfaceGuard = specimen => {
  mustMatch(specimen, InterfaceGuardShape, 'interfaceGuard');
};$h͏_once.assertInterfaceGuard(assertInterfaceGuard);
hideAndHardenFunction(assertInterfaceGuard);

/**
 * @template {Record<PropertyKey, MethodGuard>} [M = Record<PropertyKey, MethodGuard>]
 * @param {string} interfaceName
 * @param {M} methodGuards
 * @param {{ sloppy?: boolean, defaultGuards?: DefaultGuardType }} [options]
 * @returns {InterfaceGuard<M>}
 */
const makeInterfaceGuard = (interfaceName, methodGuards, options = {}) => {
  const { sloppy = false, defaultGuards = sloppy ? 'passable' : undefined } =
    options;
  // For backwards compatibility, string-keyed method guards are represented in
  // a CopyRecord. But symbol-keyed methods cannot be, so we put those in a
  // CopyMap when present.
  /** @type {Record<string, MethodGuard>} */
  const stringMethodGuards = {};
  /** @type {Array<[symbol, MethodGuard]>} */
  const symbolMethodGuardsEntries = [];
  for (const key of ownKeys(methodGuards)) {
    const value = methodGuards[/** @type {string} */ (key)];
    if (typeof key === 'symbol') {
      symbolMethodGuardsEntries.push([key, value]);
    } else {
      stringMethodGuards[key] = value;
    }
  }
  /** @type {InterfaceGuard} */
  const result = makeTagged('guard:interfaceGuard', {
    interfaceName,
    methodGuards: stringMethodGuards,
    ...(symbolMethodGuardsEntries.length
      ? { symbolMethodGuards: makeCopyMap(symbolMethodGuardsEntries) }
      : {}),
    defaultGuards,
  });
  assertInterfaceGuard(result);
  return /** @type {InterfaceGuard<M>} */ (result);
};

const GuardPayloadShapes = harden({
  'guard:awaitArgGuard': AwaitArgGuardPayloadShape,
  'guard:rawGuard': RawGuardPayloadShape,
  'guard:methodGuard': MethodGuardPayloadShape,
  'guard:interfaceGuard': InterfaceGuardPayloadShape,
});
})()
,
// === 70. patterns ./src/patterns/getGuardPayloads.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,objectMap,ArgGuardListShape,AwaitArgGuardShape,InterfaceGuardPayloadShape,InterfaceGuardShape,M,MethodGuardPayloadShape,MethodGuardShape,RawGuardShape,SyncValueGuardListShape,SyncValueGuardShape,assertAwaitArgGuard,matches,mustMatch,getCopyMapKeys,makeCopyMap;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/common/object-map.js", [["objectMap",[$h͏_a => (objectMap = $h͏_a)]]]],["./patternMatchers.js", [["ArgGuardListShape",[$h͏_a => (ArgGuardListShape = $h͏_a)]],["AwaitArgGuardShape",[$h͏_a => (AwaitArgGuardShape = $h͏_a)]],["InterfaceGuardPayloadShape",[$h͏_a => (InterfaceGuardPayloadShape = $h͏_a)]],["InterfaceGuardShape",[$h͏_a => (InterfaceGuardShape = $h͏_a)]],["M",[$h͏_a => (M = $h͏_a)]],["MethodGuardPayloadShape",[$h͏_a => (MethodGuardPayloadShape = $h͏_a)]],["MethodGuardShape",[$h͏_a => (MethodGuardShape = $h͏_a)]],["RawGuardShape",[$h͏_a => (RawGuardShape = $h͏_a)]],["SyncValueGuardListShape",[$h͏_a => (SyncValueGuardListShape = $h͏_a)]],["SyncValueGuardShape",[$h͏_a => (SyncValueGuardShape = $h͏_a)]],["assertAwaitArgGuard",[$h͏_a => (assertAwaitArgGuard = $h͏_a)]],["matches",[$h͏_a => (matches = $h͏_a)]],["mustMatch",[$h͏_a => (mustMatch = $h͏_a)]]]],["../keys/checkKey.js", [["getCopyMapKeys",[$h͏_a => (getCopyMapKeys = $h͏_a)]],["makeCopyMap",[$h͏_a => (makeCopyMap = $h͏_a)]]]]]);


















/**
 * @import {RemotableMethodName} from '@endo/pass-style';
 * @import {AwaitArgGuard, AwaitArgGuardPayload, InterfaceGuard, InterfaceGuardPayload, MethodGuard, MethodGuardPayload} from '../types.js'
 */

// The get*GuardPayload functions exist to adapt to the worlds both
// before and after https://github.com/endojs/endo/pull/1712 . When
// given something that would be the expected guard in either world,
// it returns a *GuardPayload that is valid in the current world. Thus
// it helps new consumers of these guards cope with old code that
// would construct and send these guards.

// Because the main use case for this legacy adaptation is in @endo/exo
// or packages that depend on it, the tests for this legacy adaptation
// are found in the @endo/exo `test-legacy-guard-tolerance.js`.

// Unlike LegacyAwaitArgGuardShape, LegacyMethodGuardShape,
// and LegacyInterfaceGuardShape, there is no need for a
// LegacyRawGuardShape, because raw guards were introduced at
// https://github.com/endojs/endo/pull/1831 , which was merged well after
// https://github.com/endojs/endo/pull/1712 . Thus, there was never a
// `klass:` form of the raw guard.

// TODO At such a time that we decide we no longer need to support code
// preceding https://github.com/endojs/endo/pull/1712 or guard data
// generated by that code, all the adaptation complexity in this file
// should be deleted.

// TODO manually maintain correspondence with AwaitArgGuardPayloadShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyAwaitArgGuardShape = harden({
  klass: 'awaitArg',
  argGuard: M.pattern(),
});

/**
 * By using this abstraction rather than accessing the properties directly,
 * we smooth the transition to https://github.com/endojs/endo/pull/1712,
 * tolerating both the legacy and current guard shapes.
 *
 * Note that technically, tolerating the old LegacyAwaitArgGuardShape
 * is an exploitable bug, in that a record that matches this
 * shape is also a valid parameter pattern that should allow
 * an argument that matches that pattern, i.e., a copyRecord argument that
 * at least contains a `klass: 'awaitArgGuard'` property.
 *
 * @param {AwaitArgGuard} awaitArgGuard
 * @returns {AwaitArgGuardPayload}
 */
       const getAwaitArgGuardPayload = awaitArgGuard => {
  if (matches(awaitArgGuard, LegacyAwaitArgGuardShape)) {
    // @ts-expect-error Legacy adaptor can be ill typed
    const { klass: _, ...payload } = awaitArgGuard;
    // @ts-expect-error Legacy adaptor can be ill typed
    return payload;
  }
  assertAwaitArgGuard(awaitArgGuard);
  return awaitArgGuard.payload;
};$h͏_once.getAwaitArgGuardPayload(getAwaitArgGuardPayload);
harden(getAwaitArgGuardPayload);

// TODO manually maintain correspondence with SyncMethodGuardPayloadShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacySyncMethodGuardShape = M.splitRecord(
  {
    klass: 'methodGuard',
    callKind: 'sync',
    argGuards: SyncValueGuardListShape,
    returnGuard: SyncValueGuardShape,
  },
  {
    optionalArgGuards: SyncValueGuardListShape,
    restArgGuard: SyncValueGuardShape,
  },
);

// TODO manually maintain correspondence with ArgGuardShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyArgGuardShape = M.or(
  RawGuardShape,
  AwaitArgGuardShape,
  LegacyAwaitArgGuardShape,
  M.pattern(),
);
// TODO manually maintain correspondence with ArgGuardListShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyArgGuardListShape = M.arrayOf(LegacyArgGuardShape);

// TODO manually maintain correspondence with AsyncMethodGuardPayloadShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyAsyncMethodGuardShape = M.splitRecord(
  {
    klass: 'methodGuard',
    callKind: 'async',
    argGuards: LegacyArgGuardListShape,
    returnGuard: SyncValueGuardShape,
  },
  {
    optionalArgGuards: ArgGuardListShape,
    restArgGuard: SyncValueGuardShape,
  },
);

// TODO manually maintain correspondence with MethodGuardPayloadShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyMethodGuardShape = M.or(
  LegacySyncMethodGuardShape,
  LegacyAsyncMethodGuardShape,
);

const adaptLegacyArgGuard = argGuard =>
  matches(argGuard, LegacyAwaitArgGuardShape)
    ? M.await(getAwaitArgGuardPayload(argGuard).argGuard)
    : argGuard;

/**
 * By using this abstraction rather than accessing the properties directly,
 * we smooth the transition to https://github.com/endojs/endo/pull/1712,
 * tolerating both the legacy and current guard shapes.
 *
 * Unlike LegacyAwaitArgGuardShape, tolerating LegacyMethodGuardShape
 * does not seem like a currently exploitable bug, because there is not
 * currently any context where either a methodGuard or a copyRecord would
 * both be meaningful.
 *
 * @param {MethodGuard} methodGuard
 * @returns {MethodGuardPayload}
 */
       const getMethodGuardPayload = methodGuard => {
  if (matches(methodGuard, MethodGuardShape)) {
    return methodGuard.payload;
  }
  mustMatch(methodGuard, LegacyMethodGuardShape, 'legacyMethodGuard');
  const {
    // @ts-expect-error Legacy adaptor can be ill typed
    klass: _,
    // @ts-expect-error Legacy adaptor can be ill typed
    callKind,
    // @ts-expect-error Legacy adaptor can be ill typed
    returnGuard,
    // @ts-expect-error Legacy adaptor can be ill typed
    restArgGuard,
  } = methodGuard;
  let {
    // @ts-expect-error Legacy adaptor can be ill typed
    argGuards,
    // @ts-expect-error Legacy adaptor can be ill typed
    optionalArgGuards,
  } = methodGuard;
  if (callKind === 'async') {
    argGuards = argGuards.map(adaptLegacyArgGuard);
    optionalArgGuards =
      optionalArgGuards && optionalArgGuards.map(adaptLegacyArgGuard);
  }
  const payload = harden({
    callKind,
    argGuards,
    optionalArgGuards,
    restArgGuard,
    returnGuard,
  });
  // ensure the adaptation succeeded.
  mustMatch(payload, MethodGuardPayloadShape, 'internalMethodGuardAdaptor');
  return payload;
};$h͏_once.getMethodGuardPayload(getMethodGuardPayload);
harden(getMethodGuardPayload);

// TODO manually maintain correspondence with InterfaceGuardPayloadShape
// because this one needs to be stable and accommodate nested legacy,
// when that's an issue.
const LegacyInterfaceGuardShape = M.splitRecord(
  {
    klass: 'Interface',
    interfaceName: M.string(),
    methodGuards: M.recordOf(
      M.string(),
      M.or(MethodGuardShape, LegacyMethodGuardShape),
    ),
  },
  {
    defaultGuards: M.or(M.undefined(), 'passable', 'raw'),
    sloppy: M.boolean(),
    // There is no need to accommodate LegacyMethodGuardShape in
    // this position, since `symbolMethodGuards happened
    // after https://github.com/endojs/endo/pull/1712
    symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape),
  },
);

const adaptMethodGuard = methodGuard => {
  if (matches(methodGuard, LegacyMethodGuardShape)) {
    const {
      callKind,
      argGuards,
      optionalArgGuards = [],
      restArgGuard = M.any(),
      returnGuard,
    } = getMethodGuardPayload(methodGuard);
    const mCall = callKind === 'sync' ? M.call : M.callWhen;
    return mCall(...argGuards)
      .optional(...optionalArgGuards)
      .rest(restArgGuard)
      .returns(returnGuard);
  }
  return methodGuard;
};

/**
 * By using this abstraction rather than accessing the properties directly,
 * we smooth the transition to https://github.com/endojs/endo/pull/1712,
 * tolerating both the legacy and current guard shapes.
 *
 * Unlike `LegacyAwaitArgGuardShape`, tolerating `LegacyInterfaceGuardShape`
 * does not seem like a currently exploitable bug, because there is not
 * currently any context where either an interfaceGuard or a copyRecord would
 * both be meaningful.
 *
 * @template {Record<RemotableMethodName, MethodGuard>} [T=Record<RemotableMethodName, MethodGuard>]
 * @param {InterfaceGuard<T>} interfaceGuard
 * @returns {InterfaceGuardPayload<T>}
 */
       const getInterfaceGuardPayload = interfaceGuard => {
  if (matches(interfaceGuard, InterfaceGuardShape)) {
    return interfaceGuard.payload;
  }
  mustMatch(interfaceGuard, LegacyInterfaceGuardShape, 'legacyInterfaceGuard');
  // @ts-expect-error Legacy adaptor can be ill typed
  // eslint-disable-next-line prefer-const
  let { klass: _, interfaceName, methodGuards, ...rest } = interfaceGuard;
  methodGuards = objectMap(methodGuards, adaptMethodGuard);
  const payload = harden({
    interfaceName,
    methodGuards,
    ...rest,
  });
  mustMatch(
    payload,
    InterfaceGuardPayloadShape,
    'internalInterfaceGuardAdaptor',
  );
  return payload;
};$h͏_once.getInterfaceGuardPayload(getInterfaceGuardPayload);
harden(getInterfaceGuardPayload);

const emptyCopyMap = makeCopyMap([]);

/**
 * @param {InterfaceGuard} interfaceGuard
 * @returns {(string | symbol)[]}
 */
       const getInterfaceMethodKeys = interfaceGuard => {
  const { methodGuards, symbolMethodGuards = emptyCopyMap } =
    getInterfaceGuardPayload(interfaceGuard);
  /** @type {(string | symbol)[]} */
  // TODO at-ts-expect-error works locally but not from @endo/exo
  // @ts-ignore inference is too weak to see this is ok
  return harden([
    ...Reflect.ownKeys(methodGuards),
    ...getCopyMapKeys(symbolMethodGuards),
  ]);
};$h͏_once.getInterfaceMethodKeys(getInterfaceMethodKeys);
harden(getInterfaceMethodKeys);

// Tested in @endo/exo by exo-wobbly-point.test.js since that's already
// about class inheritance, which naturally goes with interface
// inheritance.
/**
 * This ignores symbol-named method guards (which cannot be represented
 * directly in a `CopyRecord` anyway). It returns only a `CopyRecord` of
 * the string-named method guards. This is useful for interface guard
 * inheritance patterns like
 * ```js
 * const I2 = M.interface('I2', {
 *   ...getNamedMethodGuards(I1),
 *   doMore: M.call().returns(M.any()),
 * });
 * ```
 * While we could do more to support symbol-named method guards,
 * this feature is deprecated, and hopefully will disappear soon.
 * (TODO link to PRs removing symbol-named methods and method guards.)
 *
 * @template {Record<RemotableMethodName, MethodGuard>} [T=Record<RemotableMethodName, MethodGuard>]
 * @param {InterfaceGuard<T>} interfaceGuard
 */
       const getNamedMethodGuards = interfaceGuard =>
  getInterfaceGuardPayload(interfaceGuard).methodGuards;$h͏_once.getNamedMethodGuards(getNamedMethodGuards);
harden(getNamedMethodGuards);
})()
,
// === 71. patterns ./types-index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 72. patterns ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/keys/checkKey.js", []],["./src/keys/copySet.js", []],["./src/keys/copyBag.js", []],["./src/keys/compareKeys.js", []],["./src/keys/merge-set-operators.js", []],["./src/keys/merge-bag-operators.js", []],["./src/patterns/patternMatchers.js", []],["./src/patterns/getGuardPayloads.js", []],["./types-index.js", []],["@endo/common/list-difference.js", []],["@endo/common/object-map.js", []]]);
})()
,
// === 73. exo ./src/get-interface.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// @ts-check

/**
 * @import {RemotableMethodName} from '@endo/pass-style';
 */

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface, if it has one.
 *
 * Intended to be similar to `GET_METHOD_NAMES` from `@endo/pass-style`.
 *
 * See https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
       const GET_INTERFACE_GUARD = '__getInterfaceGuard__';

/**
 * @template {Record<RemotableMethodName, CallableFunction>} M
 * @typedef {{
 *   [GET_INTERFACE_GUARD]?: () =>
 *     import('@endo/patterns').InterfaceGuard<{
 *       [K in keyof M]: import('@endo/patterns').MethodGuard
 *     }> | undefined
 * }} GetInterfaceGuard
 */$h͏_once.GET_INTERFACE_GUARD(GET_INTERFACE_GUARD);
})()
,
// === 74. exo ./src/exo-tools.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,E,getRemotableMethodNames,toThrowable,Far,mustMatch,M,isAwaitArgGuard,isRawGuard,getAwaitArgGuardPayload,getMethodGuardPayload,getInterfaceGuardPayload,getCopyMapEntries,listDifference,objectMap,q,Fail,GET_INTERFACE_GUARD;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/eventual-send", [["E",[$h͏_a => (E = $h͏_a)]]]],["@endo/pass-style", [["getRemotableMethodNames",[$h͏_a => (getRemotableMethodNames = $h͏_a)]],["toThrowable",[$h͏_a => (toThrowable = $h͏_a)]],["Far",[$h͏_a => (Far = $h͏_a)]]]],["@endo/patterns", [["mustMatch",[$h͏_a => (mustMatch = $h͏_a)]],["M",[$h͏_a => (M = $h͏_a)]],["isAwaitArgGuard",[$h͏_a => (isAwaitArgGuard = $h͏_a)]],["isRawGuard",[$h͏_a => (isRawGuard = $h͏_a)]],["getAwaitArgGuardPayload",[$h͏_a => (getAwaitArgGuardPayload = $h͏_a)]],["getMethodGuardPayload",[$h͏_a => (getMethodGuardPayload = $h͏_a)]],["getInterfaceGuardPayload",[$h͏_a => (getInterfaceGuardPayload = $h͏_a)]],["getCopyMapEntries",[$h͏_a => (getCopyMapEntries = $h͏_a)]]]],["@endo/common/list-difference.js", [["listDifference",[$h͏_a => (listDifference = $h͏_a)]]]],["@endo/common/object-map.js", [["objectMap",[$h͏_a => (objectMap = $h͏_a)]]]],["@endo/errors", [["q",[$h͏_a => (q = $h͏_a)]],["Fail",[$h͏_a => (Fail = $h͏_a)]]]],["./get-interface.js", [["GET_INTERFACE_GUARD",[$h͏_a => (GET_INTERFACE_GUARD = $h͏_a)]]]]]);

















/**
 * @import {RemotableMethodName} from '@endo/pass-style';
 * @import {InterfaceGuard, Method, MethodGuard, MethodGuardPayload, DefaultGuardType} from '@endo/patterns'
 * @import {ClassContext, ContextProvider, FacetName, KitContext, KitContextProvider, MatchConfig, Methods} from './types.js'
 * @import {GetInterfaceGuard} from './get-interface.js';
 */

const { apply, ownKeys } = Reflect;
const { defineProperties, fromEntries, hasOwn } = Object;

/**
 * A method guard, for inclusion in an interface guard, that does not
 * enforce any constraints of incoming arguments or return results.
 */
const RawMethodGuard = M.call().rest(M.raw()).returns(M.raw());

const REDACTED_RAW_ARG = '<redacted raw arg>';

/**
 * A method guard, for inclusion in an interface guard, that enforces only that
 * all arguments are passable and that the result is passable. (In far classes,
 * "any" means any *passable*.) This is the least possible non-raw
 * enforcement for a method guard, and is implied by all other
 * non-raw method guards.
 */
const PassableMethodGuard = M.call().rest(M.any()).returns(M.any());

/**
 * @param {import('@endo/pass-style').Passable[]} syncArgs
 * @param {MatchConfig} matchConfig
 * @param {string} [label]
 * @returns {import('@endo/pass-style').Passable[]} Returns the args that should be passed to the raw method.
 */
const defendSyncArgs = (syncArgs, matchConfig, label = undefined) => {
  const {
    declaredLen,
    hasRestArgGuard,
    restArgGuardIsRaw,
    paramsPattern,
    redactedIndices,
  } = matchConfig;

  // Use syncArgs if possible, but copy it when necessary to implement
  // redactions.
  let matchableArgs = syncArgs;
  if (restArgGuardIsRaw && syncArgs.length > declaredLen) {
    const restLen = syncArgs.length - declaredLen;
    const redactedRest = Array(restLen).fill(REDACTED_RAW_ARG);
    matchableArgs = [...syncArgs.slice(0, declaredLen), ...redactedRest];
  } else if (
    redactedIndices.length > 0 &&
    redactedIndices[0] < syncArgs.length
  ) {
    // Copy the arguments array, avoiding hardening the redacted ones (which are
    // trivially matched using REDACTED_RAW_ARG as a sentinel value).
    matchableArgs = [...syncArgs];
  }

  for (const i of redactedIndices) {
    if (i >= matchableArgs.length) {
      break;
    }
    matchableArgs[i] = REDACTED_RAW_ARG;
  }

  mustMatch(harden(matchableArgs), paramsPattern, label);

  if (hasRestArgGuard) {
    return syncArgs;
  }
  syncArgs.length <= declaredLen ||
    Fail`${q(label)} accepts at most ${q(declaredLen)} arguments, not ${q(
      syncArgs.length,
    )}: ${syncArgs}`;
  return syncArgs;
};

/**
 * Convert a method guard to a match config for more efficient per-call
 * execution.  This is a one-time conversion, so it's OK to be slow.
 *
 * Most of the work is done to detect `M.raw()` so that we build a match pattern
 * and metadata instead of doing this in the hot path.
 * @param {MethodGuardPayload} methodGuardPayload
 * @returns {MatchConfig}
 */
const buildMatchConfig = methodGuardPayload => {
  const {
    argGuards,
    optionalArgGuards = [],
    restArgGuard,
  } = methodGuardPayload;

  const matchableArgGuards = [...argGuards, ...optionalArgGuards];

  const redactedIndices = [];
  for (let i = 0; i < matchableArgGuards.length; i += 1) {
    if (isRawGuard(matchableArgGuards[i])) {
      matchableArgGuards[i] = REDACTED_RAW_ARG;
      redactedIndices.push(i);
    }
  }

  // Pass through raw rest arguments without matching.
  let matchableRestArgGuard = restArgGuard;
  if (isRawGuard(matchableRestArgGuard)) {
    matchableRestArgGuard = M.arrayOf(REDACTED_RAW_ARG);
  }
  const matchableMethodGuardPayload = harden({
    ...methodGuardPayload,
    argGuards: matchableArgGuards.slice(0, argGuards.length),
    optionalArgGuards: matchableArgGuards.slice(argGuards.length),
    restArgGuard: matchableRestArgGuard,
  });

  const paramsPattern = M.splitArray(
    matchableMethodGuardPayload.argGuards,
    matchableMethodGuardPayload.optionalArgGuards,
    matchableMethodGuardPayload.restArgGuard,
  );

  return harden({
    declaredLen: matchableArgGuards.length,
    hasRestArgGuard: restArgGuard !== undefined,
    restArgGuardIsRaw: restArgGuard !== matchableRestArgGuard,
    paramsPattern,
    redactedIndices,
    matchableMethodGuardPayload,
  });
};

/**
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 * @returns {Method}
 */
const defendSyncMethod = (
  getContext,
  behaviorMethod,
  methodGuardPayload,
  label,
) => {
  const { returnGuard } = methodGuardPayload;
  const isRawReturn = isRawGuard(returnGuard);
  const matchConfig = buildMatchConfig(methodGuardPayload);
  const { syncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    syncMethod(...syncArgs) {
      try {
        const context = getContext(this);
        // Only harden args and return value if not dealing with a raw value guard.
        const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
        const result = apply(behaviorMethod, context, realArgs);
        if (!isRawReturn) {
          mustMatch(harden(result), returnGuard, `${label}: result`);
        }
        return result;
      } catch (thrownThing) {
        throw toThrowable(thrownThing);
      }
    },
  };
  return syncMethod;
};

/**
 * @param {MethodGuardPayload} methodGuardPayload
 */
const desync = methodGuardPayload => {
  const {
    argGuards,
    optionalArgGuards = [],
    restArgGuard,
  } = methodGuardPayload;
  !isAwaitArgGuard(restArgGuard) ||
    Fail`Rest args may not be awaited: ${restArgGuard}`;
  const rawArgGuards = [...argGuards, ...optionalArgGuards];

  const awaitIndexes = [];
  for (let i = 0; i < rawArgGuards.length; i += 1) {
    const argGuard = rawArgGuards[i];
    if (isAwaitArgGuard(argGuard)) {
      rawArgGuards[i] = getAwaitArgGuardPayload(argGuard).argGuard;
      awaitIndexes.push(i);
    }
  }
  return {
    awaitIndexes,
    rawMethodGuardPayload: {
      ...methodGuardPayload,
      argGuards: rawArgGuards.slice(0, argGuards.length),
      optionalArgGuards: rawArgGuards.slice(argGuards.length),
    },
  };
};

/**
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 */
const defendAsyncMethod = (
  getContext,
  behaviorMethod,
  methodGuardPayload,
  label,
) => {
  const { returnGuard } = methodGuardPayload;
  const isRawReturn = isRawGuard(returnGuard);

  const { awaitIndexes, rawMethodGuardPayload } = desync(methodGuardPayload);
  const matchConfig = buildMatchConfig(rawMethodGuardPayload);

  const { asyncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    asyncMethod(...args) {
      const awaitList = [];
      for (const i of awaitIndexes) {
        if (i >= args.length) {
          break;
        }
        awaitList.push(args[i]);
      }
      const p = Promise.all(awaitList);
      const syncArgs = [...args];
      const resultP = E.when(
        p,
        /** @param {any[]} awaitedArgs */ awaitedArgs => {
          for (let j = 0; j < awaitedArgs.length; j += 1) {
            syncArgs[awaitIndexes[j]] = awaitedArgs[j];
          }
          // Get the context after all waiting in case we ever do revocation
          // by removing the context entry. Avoid TOCTTOU!
          const context = getContext(this);
          const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
          return apply(behaviorMethod, context, realArgs);
        },
      );
      return E.when(resultP, fulfillment => {
        if (!isRawReturn) {
          mustMatch(harden(fulfillment), returnGuard, `${label}: result`);
        }
        return fulfillment;
      }).catch(reason =>
        // Done is a chained `.catch` rather than an onRejected clause of the
        // `E.when` above in case the `mustMatch` throws.
        Promise.reject(toThrowable(reason)),
      );
    },
  };
  return asyncMethod;
};

/**
 *
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuard} methodGuard
 * @param {string} label
 */
const defendMethod = (getContext, behaviorMethod, methodGuard, label) => {
  const methodGuardPayload = getMethodGuardPayload(methodGuard);
  const { callKind } = methodGuardPayload;
  if (callKind === 'sync') {
    return defendSyncMethod(
      getContext,
      behaviorMethod,
      methodGuardPayload,
      label,
    );
  } else {
    assert(callKind === 'async');
    return defendAsyncMethod(
      getContext,
      behaviorMethod,
      methodGuardPayload,
      label,
    );
  }
};

/**
 * @param {string} methodTag
 * @param {ContextProvider} contextProvider
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuard} methodGuard
 */
const bindMethod = (
  methodTag,
  contextProvider,
  behaviorMethod,
  methodGuard,
) => {
  assert.typeof(behaviorMethod, 'function');

  /**
   * @param {any} representative
   * @returns {ClassContext | KitContext}
   */
  const getContext = representative => {
    representative ||
      // separate line to ease breakpointing
      Fail`Method ${methodTag} called without 'this' object`;
    const context = contextProvider(representative);
    if (context === undefined) {
      throw Fail`${q(
        methodTag,
      )} may only be applied to a valid instance: ${representative}`;
    }
    return context;
  };

  const method = defendMethod(
    getContext,
    behaviorMethod,
    methodGuard,
    methodTag,
  );

  defineProperties(method, {
    name: { value: methodTag },
    length: { value: behaviorMethod.length },
  });
  return method;
};

/**
 * @template {Record<RemotableMethodName, CallableFunction>} T
 * @param {string} tag
 * @param {ContextProvider} contextProvider
 * @param {T} behaviorMethods
 * @param {boolean} [thisfulMethods]
 * @param {InterfaceGuard<{ [M in keyof T]: MethodGuard }>} [interfaceGuard]
 */
       const defendPrototype = (
  tag,
  contextProvider,
  behaviorMethods,
  thisfulMethods = false,
  interfaceGuard = undefined,
) => {
  const prototype = {};
  const methodNames = getRemotableMethodNames(behaviorMethods).filter(
    // By ignoring any method that seems to be a constructor, we can use a
    // class.prototype as a behaviorMethods.
    key => {
      if (key !== 'constructor') {
        return true;
      }
      const constructor = behaviorMethods.constructor;
      return !(
        constructor.prototype &&
        constructor.prototype.constructor === constructor
      );
    },
  );
  /** @type {Record<RemotableMethodName, MethodGuard> | undefined} */
  let methodGuards;
  /** @type {DefaultGuardType} */
  let defaultGuards;
  if (interfaceGuard) {
    const {
      interfaceName,
      methodGuards: mg,
      symbolMethodGuards,
      sloppy,
      defaultGuards: dg = sloppy ? 'passable' : undefined,
    } = getInterfaceGuardPayload(interfaceGuard);
    methodGuards = harden({
      ...mg,
      ...(symbolMethodGuards &&
        fromEntries(getCopyMapEntries(symbolMethodGuards))),
    });
    defaultGuards = dg;
    {
      const methodGuardNames = ownKeys(methodGuards);
      const unimplemented = listDifference(methodGuardNames, methodNames);
      unimplemented.length === 0 ||
        Fail`methods ${q(unimplemented)} not implemented by ${q(tag)}`;
      if (defaultGuards === undefined) {
        const unguarded = listDifference(methodNames, methodGuardNames);
        unguarded.length === 0 ||
          Fail`methods ${q(unguarded)} not guarded by ${q(interfaceName)}`;
      }
    }
  }

  for (const prop of methodNames) {
    const originalMethod = behaviorMethods[prop];
    const { shiftedMethod } = {
      shiftedMethod(...args) {
        return originalMethod(this, ...args);
      },
    };
    const behaviorMethod = thisfulMethods ? originalMethod : shiftedMethod;
    // TODO some tool does not yet understand the `?.[` syntax
    // See https://github.com/endojs/endo/pull/2247#discussion_r1583724424
    let methodGuard = methodGuards && methodGuards[prop];
    if (!methodGuard) {
      switch (defaultGuards) {
        case undefined: {
          if (thisfulMethods) {
            methodGuard = PassableMethodGuard;
          } else {
            methodGuard = RawMethodGuard;
          }
          break;
        }
        case 'passable': {
          methodGuard = PassableMethodGuard;
          break;
        }
        case 'raw': {
          methodGuard = RawMethodGuard;
          break;
        }
        default: {
          throw Fail`Unrecognized defaultGuards ${q(defaultGuards)}`;
        }
      }
    }
    prototype[prop] = bindMethod(
      `In ${q(prop)} method of (${tag})`,
      contextProvider,
      behaviorMethod,
      methodGuard,
    );
  }

  if (!hasOwn(prototype, GET_INTERFACE_GUARD)) {
    const getInterfaceGuardMethod = {
      [GET_INTERFACE_GUARD]() {
        // Note: May be `undefined`
        return interfaceGuard;
      },
    }[GET_INTERFACE_GUARD];
    prototype[GET_INTERFACE_GUARD] = bindMethod(
      `In ${q(GET_INTERFACE_GUARD)} method of (${tag})`,
      contextProvider,
      getInterfaceGuardMethod,
      PassableMethodGuard,
    );
  }

  return Far(tag, /** @type {T & GetInterfaceGuard<T>} */ (prototype));
};$h͏_once.defendPrototype(defendPrototype);
harden(defendPrototype);

/**
 * @template {Record<FacetName, Methods>} F
 * @param {string} tag
 * @param {{ [K in keyof F]: KitContextProvider }} contextProviderKit
 * @param {F} behaviorMethodsKit
 * @param {boolean} [thisfulMethods]
 * @param {{ [K in keyof F]: InterfaceGuard<Record<keyof F[K], MethodGuard>> }} [interfaceGuardKit]
 */
       const defendPrototypeKit = (
  tag,
  contextProviderKit,
  behaviorMethodsKit,
  thisfulMethods = false,
  interfaceGuardKit = undefined,
) => {
  const facetNames = ownKeys(behaviorMethodsKit).sort();
  facetNames.length > 1 || Fail`A multi-facet object must have multiple facets`;
  if (interfaceGuardKit) {
    const interfaceNames = ownKeys(interfaceGuardKit);
    const extraInterfaceNames = listDifference(facetNames, interfaceNames);
    extraInterfaceNames.length === 0 ||
      Fail`Interfaces ${q(extraInterfaceNames)} not implemented by ${q(tag)}`;
    const extraFacetNames = listDifference(interfaceNames, facetNames);
    extraFacetNames.length === 0 ||
      Fail`Facets ${q(extraFacetNames)} of ${q(tag)} not guarded by interfaces`;
  }
  const contextMapNames = ownKeys(contextProviderKit);
  const extraContextNames = listDifference(facetNames, contextMapNames);
  extraContextNames.length === 0 ||
    Fail`Contexts ${q(extraContextNames)} not implemented by ${q(tag)}`;
  const extraFacetNames = listDifference(contextMapNames, facetNames);
  extraFacetNames.length === 0 ||
    Fail`Facets ${q(extraFacetNames)} of ${q(tag)} missing contexts`;
  const protoKit = objectMap(behaviorMethodsKit, (behaviorMethods, facetName) =>
    defendPrototype(
      `${tag} ${String(facetName)}`,
      contextProviderKit[facetName],
      behaviorMethods,
      thisfulMethods,
      interfaceGuardKit && interfaceGuardKit[facetName],
    ),
  );
  return protoKit;
};$h͏_once.defendPrototypeKit(defendPrototypeKit);
})()
,
// === 75. exo ./src/exo-makers.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,objectMap,environmentOptionsListHas,Fail,q,defendPrototype,defendPrototypeKit;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/common/object-map.js", [["objectMap",[$h͏_a => (objectMap = $h͏_a)]]]],["@endo/env-options", [["environmentOptionsListHas",[$h͏_a => (environmentOptionsListHas = $h͏_a)]]]],["@endo/errors", [["Fail",[$h͏_a => (Fail = $h͏_a)]],["q",[$h͏_a => (q = $h͏_a)]]]],["./exo-tools.js", [["defendPrototype",[$h͏_a => (defendPrototype = $h͏_a)]],["defendPrototypeKit",[$h͏_a => (defendPrototypeKit = $h͏_a)]]]]]);






/**
 * @import {Amplify, ExoClassKitMethods, ExoClassMethods, FarClassOptions, Guarded, GuardedKit, ExoClassInterfaceGuardKit, IsInstance, KitContext, ExoClassInterfaceGuard, Methods, FacetName} from './types.js';
 */

const { create, seal, freeze, defineProperty, values } = Object;

// Turn on to give each exo instance its own toStringTag value.
const LABEL_INSTANCES = environmentOptionsListHas('DEBUG', 'label-instances');

/**
 * @template {{}} T
 * @param {T} proto
 * @param {number} instanceCount
 * @returns {T}
 */
const makeSelf = (proto, instanceCount) => {
  const self = create(proto);
  if (LABEL_INSTANCES) {
    defineProperty(self, Symbol.toStringTag, {
      value: `${proto[Symbol.toStringTag]}#${instanceCount}`,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  return harden(self);
};

/** @type {Record<PropertyKey, never>} */
const emptyRecord = harden({});

/**
 * When calling `defineDurableKind` and
 * its siblings, used as the `init` function argument to indicate that the
 * state record of the (virtual/durable) instances of the kind/exoClass
 * should be empty, and that the returned maker function should have zero
 * parameters.
 */
       const initEmpty = () => emptyRecord;

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Methods} M methods
 * @param {string} tag
 * @param {ExoClassInterfaceGuard<M> | undefined} interfaceGuard
 * @param {I} init
 * @param {ExoClassMethods<M, I>} methods
 * @param {FarClassOptions<import('./types.js').ClassContext<ReturnType<I>, M>>} [options]
 * @returns {(...args: Parameters<I>) => Guarded<M>}
 */$h͏_once.initEmpty(initEmpty);
       const defineExoClass = (
  tag,
  interfaceGuard,
  init,
  methods,
  options = {},
) => {
  harden(methods);
  const {
    finish = undefined,
    receiveAmplifier = undefined,
    receiveInstanceTester = undefined,
  } = options;
  receiveAmplifier === undefined ||
    Fail`Only facets of an exo class kit can be amplified ${q(tag)}`;

  /** @type {WeakMap<M, import('./types.js').ClassContext<ReturnType<I>, M>>} */
  const contextMap = new WeakMap();
  const proto = defendPrototype(
    tag,
    self => /** @type {any} */ (contextMap.get(self)),
    methods,
    true,
    interfaceGuard,
  );
  let instanceCount = 0;
  /**
   * @param  {Parameters<I>} args
   */
  const makeInstance = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    instanceCount += 1;
    const self = makeSelf(proto, instanceCount);

    // Be careful not to freeze the state record
    /** @type {import('./types.js').ClassContext<ReturnType<I>,M>} */
    const context = freeze({ state, self });
    contextMap.set(self, context);
    if (finish) {
      finish(context);
    }
    return self;
  };

  if (receiveInstanceTester) {
    /** @type {IsInstance} */
    const isInstance = (exo, facetName = undefined) => {
      facetName === undefined ||
        Fail`facetName can only be used with an exo class kit: ${q(
          tag,
        )} has no facet ${q(facetName)}`;
      return contextMap.has(exo);
    };
    harden(isInstance);
    receiveInstanceTester(isInstance);
  }

  return harden(makeInstance);
};$h͏_once.defineExoClass(defineExoClass);
harden(defineExoClass);

/**
 * @template {(...args: any[]) => any} I init function
 * @template {Record<FacetName, Methods>} F facet methods
 * @param {string} tag
 * @param {ExoClassInterfaceGuardKit<F> | undefined } interfaceGuardKit
 * @param {I} init
 * @param {ExoClassKitMethods<F, I>} methodsKit
 * @param {FarClassOptions<
 *   KitContext<ReturnType<I>, GuardedKit<F>>,
 *   GuardedKit<F>
 * >} [options]
 * @returns {(...args: Parameters<I>) => GuardedKit<F>}
 */
       const defineExoClassKit = (
  tag,
  interfaceGuardKit,
  init,
  methodsKit,
  options = {},
) => {
  harden(methodsKit);
  const {
    finish = undefined,
    receiveAmplifier = undefined,
    receiveInstanceTester = undefined,
  } = options;
  const contextMapKit = objectMap(methodsKit, () => new WeakMap());
  const getContextKit = objectMap(
    contextMapKit,
    contextMap => facet => contextMap.get(facet),
  );
  const prototypeKit = defendPrototypeKit(
    tag,
    getContextKit,
    methodsKit,
    true,
    interfaceGuardKit,
  );
  let instanceCount = 0;
  /**
   * @param {Parameters<I>} args
   */
  const makeInstanceKit = (...args) => {
    // Be careful not to freeze the state record
    const state = seal(init(...args));
    // Don't freeze context until we add facets
    /** @type {{ state: ReturnType<I>, facets: any }} */
    const context = { state, facets: null };
    instanceCount += 1;
    const facets = objectMap(prototypeKit, (proto, facetName) => {
      const self = makeSelf(proto, instanceCount);
      contextMapKit[facetName].set(self, context);
      return self;
    });
    context.facets = facets;
    // Be careful not to freeze the state record
    freeze(context);
    if (finish) {
      finish(context);
    }
    return /** @type {GuardedKit<F>} */ (context.facets);
  };

  if (receiveAmplifier) {
    /** @type {Amplify} */
    const amplify = exoFacet => {
      for (const contextMap of values(contextMapKit)) {
        if (contextMap.has(exoFacet)) {
          const { facets } = contextMap.get(exoFacet);
          return facets;
        }
      }
      throw Fail`Must be a facet of ${q(tag)}: ${exoFacet}`;
    };
    harden(amplify);
    receiveAmplifier(amplify);
  }

  if (receiveInstanceTester) {
    /** @type {IsInstance} */
    const isInstance = (exoFacet, facetName = undefined) => {
      if (facetName === undefined) {
        return values(contextMapKit).some(contextMap =>
          contextMap.has(exoFacet),
        );
      }
      assert.typeof(facetName, 'string');
      const contextMap = contextMapKit[facetName];
      contextMap !== undefined ||
        Fail`exo class kit ${q(tag)} has no facet named ${q(facetName)}`;
      return contextMap.has(exoFacet);
    };
    harden(isInstance);
    receiveInstanceTester(isInstance);
  }

  return harden(makeInstanceKit);
};$h͏_once.defineExoClassKit(defineExoClassKit);
harden(defineExoClassKit);

/**
 * Return a singleton instance of an internal ExoClass with no state fields.
 *
 * @template {Methods} M
 * @param {string} tag
 * @param {import('@endo/patterns').InterfaceGuard<{
 *   [K in keyof M]: import('@endo/patterns').MethodGuard
 * }> | undefined} interfaceGuard CAVEAT: static typing does not yet support `callWhen` transformation
 * @param {ExoClassMethods<M, typeof initEmpty>} methods
 * @param {FarClassOptions<import('./types.js').ClassContext<{}, M>>} [options]
 * @returns {Guarded<M>}
 */
       const makeExo = (tag, interfaceGuard, methods, options = undefined) => {
  const makeInstance = defineExoClass(
    tag,
    interfaceGuard,
    initEmpty,
    methods,
    options,
  );
  return makeInstance();
};$h͏_once.makeExo(makeExo);
harden(makeExo);
})()
,
// === 76. exo ./src/types.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);
})()
,
// === 77. exo ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/exo-makers.js", []],["./src/types.js", []],["./src/get-interface.js", []]]);
})()
,
// === 78. base64 ./src/common.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// @ts-check

const { freeze } = Object;

       const padding = '=';$h͏_once.padding(padding);

       const alphabet64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The numeric value corresponding to each letter of the alphabet.
 * If an alphabet is named for the Greek letters alpha and beta, then clearly a
 * monodu is named for the corresponding Greek numbers mono and duo.
 *
 * @type {Record<string, number>}
 */$h͏_once.alphabet64(alphabet64);
       const monodu64 = {};$h͏_once.monodu64(monodu64);
for (let i = 0; i < alphabet64.length; i += 1) {
  const c = alphabet64[i];
  monodu64[c] = i;
}
freeze(monodu64);
})()
,
// === 79. base64 ./src/encode.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let alphabet64,padding;$h͏_imports([["./common.js", [["alphabet64",[$h͏_a => (alphabet64 = $h͏_a)]],["padding",[$h͏_a => (padding = $h͏_a)]]]]]);





/**
 * XSnap is a JavaScript engine based on Moddable/XS.
 * The algorithm below is orders of magnitude too slow on this VM, but it
 * arranges a native binding on the global object.
 * We use that if it is available instead.
 *
 * This function is exported from this *file* for use in benchmarking,
 * but is not part of the *module*'s public API.
 *
 * @param {Uint8Array} data
 * @returns {string} base64 encoding
 */
       const jsEncodeBase64 = data => {
  // A cursory benchmark shows that string concatenation is about 25% faster
  // than building an array and joining it in v8, in 2020, for strings of about
  // 100 long.
  let string = '';
  let register = 0;
  let quantum = 0;

  for (let i = 0; i < data.length; i += 1) {
    const b = data[i];
    register = (register << 8) | b;
    quantum += 8;
    if (quantum === 24) {
      string +=
        alphabet64[(register >>> 18) & 0x3f] +
        alphabet64[(register >>> 12) & 0x3f] +
        alphabet64[(register >>> 6) & 0x3f] +
        alphabet64[(register >>> 0) & 0x3f];
      register = 0;
      quantum = 0;
    }
  }

  switch (quantum) {
    case 0:
      break;
    case 8:
      string +=
        alphabet64[(register >>> 2) & 0x3f] +
        alphabet64[(register << 4) & 0x3f] +
        padding +
        padding;
      break;
    case 16:
      string +=
        alphabet64[(register >>> 10) & 0x3f] +
        alphabet64[(register >>> 4) & 0x3f] +
        alphabet64[(register << 2) & 0x3f] +
        padding;
      break;
    default:
      throw Error(`internal: bad quantum ${quantum}`);
  }
  return string;
};

/**
 * Encodes bytes into a Base64 string, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * @type {typeof jsEncodeBase64}
 */$h͏_once.jsEncodeBase64(jsEncodeBase64);
       const encodeBase64 =
  globalThis.Base64 !== undefined ? globalThis.Base64.encode : jsEncodeBase64;$h͏_once.encodeBase64(encodeBase64);
})()
,
// === 80. base64 ./src/decode.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let monodu64,padding;$h͏_imports([["./common.js", [["monodu64",[$h͏_a => (monodu64 = $h͏_a)]],["padding",[$h͏_a => (padding = $h͏_a)]]]]]);





/**
 * Decodes a Base64 string into bytes, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * XSnap is a JavaScript engine based on Moddable/XS.
 * The algorithm below is orders of magnitude too slow on this VM, but it
 * arranges a native binding on the global object.
 * We use that if it is available instead.
 *
 * This function is exported from this *file* for use in benchmarking,
 * but is not part of the *module*'s public API.
 *
 * @param {string} string Base64-encoded string
 * @param {string} [name] The name of the string as it will appear in error
 * messages.
 * @returns {Uint8Array} decoded bytes
 */
       const jsDecodeBase64 = (string, name = '<unknown>') => {
  const data = new Uint8Array(Math.ceil((string.length * 4) / 3));
  let register = 0;
  let quantum = 0;
  let i = 0; // index in string
  let j = 0; // index in data

  while (i < string.length && string[i] !== padding) {
    const number = monodu64[string[i]];
    if (number === undefined) {
      throw Error(`Invalid base64 character ${string[i]} in string ${name}`);
    }
    register = (register << 6) | number;
    quantum += 6;
    if (quantum >= 8) {
      quantum -= 8;
      data[j] = register >>> quantum;
      j += 1;
      register &= (1 << quantum) - 1;
    }
    i += 1;
  }

  while (quantum > 0) {
    if (i === string.length || string[i] !== padding) {
      throw Error(`Missing padding at offset ${i} of string ${name}`);
    }
    // We MAY reject non-zero padding bits, but choose not to.
    // https://datatracker.ietf.org/doc/html/rfc4648#section-3.5
    i += 1;
    quantum -= 2;
  }

  if (i < string.length) {
    throw Error(
      `Base64 string has trailing garbage ${string.substr(
        i,
      )} in string ${name}`,
    );
  }

  return data.subarray(0, j);
};

// The XS Base64.decode function is faster, but might return ArrayBuffer (not
// Uint8Array).  Adapt it to our needs.
$h͏_once.jsDecodeBase64(jsDecodeBase64);const adaptDecoder=
  nativeDecodeBase64 =>
  (...args) => {
    const decoded = nativeDecodeBase64(...args);
    if (decoded instanceof Uint8Array) {
      return decoded;
    }
    return new Uint8Array(decoded);
  };

/** @type {typeof jsDecodeBase64} */
       const decodeBase64 =
  globalThis.Base64 !== undefined
    ? adaptDecoder(globalThis.Base64.decode)
    : jsDecodeBase64;$h͏_once.decodeBase64(decodeBase64);
})()
,
// === 81. base64 ./encode.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/encode.js", []]]);
})()
,
// === 82. base64 ./btoa.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let encodeBase64;$h͏_imports([["./encode.js", [["encodeBase64",[$h͏_a => (encodeBase64 = $h͏_a)]]]]]);

/**
 * @param {string} stringToEncode the binary string to encode
 * @returns {string} an ASCII string containing the base64 representation of `stringToEncode`
 */
       const btoa = stringToEncode => {
  const bytes = stringToEncode.split('').map(char => {
    const b = char.charCodeAt(0);
    if (b > 0xff) {
      throw Error(`btoa: character out of range: ${char}`);
    }
    return b;
  });
  const buf = new Uint8Array(bytes);
  return encodeBase64(buf);
};$h͏_once.btoa(btoa);
})()
,
// === 83. base64 ./decode.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/decode.js", []]]);
})()
,
// === 84. base64 ./atob.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let decodeBase64;$h͏_imports([["./decode.js", [["decodeBase64",[$h͏_a => (decodeBase64 = $h͏_a)]]]]]);

/**
 * @param {string} encodedData a binary string containing base64-encoded data
 * @returns {string} an ASCII string containing decoded data from `encodedData`
 */
       const atob = encodedData => {
  const buf = decodeBase64(encodedData);
  return String.fromCharCode(...buf);
};$h͏_once.atob(atob);
})()
,
// === 85. base64 ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/encode.js", []],["./src/decode.js", []],["./btoa.js", []],["./atob.js", []]]);
})()
,
// === 86. daemon ./src/envelope.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// @ts-check
/* eslint-disable no-bitwise */
/* global Buffer */

/**
 * Minimal CBOR codec for the engo envelope protocol.
 *
 * Envelopes are 4-element CBOR arrays: [handle, verb, payload, nonce].
 * Frames are CBOR byte strings wrapping encoded envelopes.
 *
 * This codec is intentionally minimal — it only handles the types used
 * by the envelope protocol (unsigned/negative integers, byte strings,
 * text strings, arrays, maps) and does not attempt to be a general-purpose
 * CBOR library.
 */

// CBOR major types
const CBOR_UINT = 0;
const CBOR_NEGINT = 1;
const CBOR_BYTES = 2;
const CBOR_TEXT = 3;
const CBOR_ARRAY = 4;
// const CBOR_MAP = 5;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------------------------------------------------------------------------
// CBOR encoding
// ---------------------------------------------------------------------------

/**
 * Append a CBOR head (major type + argument) to a byte list.
 * @param {number[]} buf - mutable byte array
 * @param {number} major - major type (0-7)
 * @param {number} n - argument value
 */
const cborAppendHead = (buf, major, n) => {
  const m = major << 5;
  if (n < 24) {
    buf.push(m | n);
  } else if (n <= 0xff) {
    buf.push(m | 24, n);
  } else if (n <= 0xffff) {
    buf.push(m | 25, (n >> 8) & 0xff, n & 0xff);
  } else if (n <= 0xffffffff) {
    buf.push(
      m | 26,
      (n >> 24) & 0xff,
      (n >> 16) & 0xff,
      (n >> 8) & 0xff,
      n & 0xff,
    );
  } else {
    // For values > 32 bits, we'd need BigInt. Handle sizes are small.
    throw new Error(`CBOR value too large: ${n}`);
  }
};

/**
 * Encode an integer (signed).
 * @param {number[]} buf
 * @param {number} n
 */
const cborAppendInt = (buf, n) => {
  if (n >= 0) {
    cborAppendHead(buf, CBOR_UINT, n);
  } else {
    cborAppendHead(buf, CBOR_NEGINT, -1 - n);
  }
};

/**
 * Encode a byte string.
 * @param {number[]} buf
 * @param {Uint8Array} data
 */
const cborAppendBytes = (buf, data) => {
  cborAppendHead(buf, CBOR_BYTES, data.length);
  for (let i = 0; i < data.length; i += 1) {
    buf.push(data[i]);
  }
};

/**
 * Encode a text string.
 * @param {number[]} buf
 * @param {string} s
 */
const cborAppendText = (buf, s) => {
  const encoded = textEncoder.encode(s);
  cborAppendHead(buf, CBOR_TEXT, encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    buf.push(encoded[i]);
  }
};

/**
 * @typedef {object} Envelope
 * @property {number} handle
 * @property {string} verb
 * @property {Uint8Array} payload
 * @property {number} nonce
 */

/**
 * Encode an envelope as a CBOR 4-element array.
 * @param {Envelope} env
 * @returns {Uint8Array}
 */
       const encodeEnvelope = env => {
  /** @type {number[]} */
  const buf = [];
  cborAppendHead(buf, CBOR_ARRAY, 4);
  cborAppendInt(buf, env.handle);
  cborAppendText(buf, env.verb);
  cborAppendBytes(buf, env.payload || new Uint8Array(0));
  cborAppendInt(buf, env.nonce || 0);
  return new Uint8Array(buf);
};$h͏_once.encodeEnvelope(encodeEnvelope);
harden(encodeEnvelope);

/**
 * Encode a CBOR frame: a byte string wrapping the given data.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
       const encodeFrame = data => {
  /** @type {number[]} */
  const buf = [];
  cborAppendBytes(buf, data);
  return new Uint8Array(buf);
};$h͏_once.encodeFrame(encodeFrame);
harden(encodeFrame);

// ---------------------------------------------------------------------------
// CBOR decoding
// ---------------------------------------------------------------------------

/**
 * A simple cursor for reading CBOR from a Uint8Array.
 * @param {Uint8Array} data
 * @returns {{ pos: number, data: Uint8Array }}
 */
const makeCursor = data => ({ pos: 0, data });

/**
 * Read a CBOR head from the cursor.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {{ major: number, value: number }}
 */
const cborReadHead = cursor => {
  if (cursor.pos >= cursor.data.length) {
    throw new Error('CBOR: unexpected end of input');
  }
  const initial = cursor.data[cursor.pos];
  cursor.pos += 1;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) {
    return { major, value: info };
  }
  let size;
  if (info === 24) size = 1;
  else if (info === 25) size = 2;
  else if (info === 26) size = 4;
  else if (info === 27) size = 8;
  else throw new Error(`CBOR: unsupported additional info ${info}`);
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value = value * 256 + cursor.data[cursor.pos + i];
  }
  cursor.pos += size;
  return { major, value };
};

/**
 * Read a CBOR integer (signed).
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {number}
 */
const cborReadInt = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major === CBOR_UINT) return value;
  if (major === CBOR_NEGINT) return -1 - value;
  throw new Error(`CBOR: expected int, got major ${major}`);
};

/**
 * Read a CBOR byte string.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {Uint8Array}
 */
const cborReadBytes = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_BYTES) {
    throw new Error(`CBOR: expected bytes (major 2), got major ${major}`);
  }
  const result = cursor.data.subarray(cursor.pos, cursor.pos + value);
  cursor.pos += value;
  return new Uint8Array(result);
};

/**
 * Read a CBOR text string.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {string}
 */
const cborReadText = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_TEXT) {
    throw new Error(`CBOR: expected text (major 3), got major ${major}`);
  }
  const result = textDecoder.decode(
    cursor.data.subarray(cursor.pos, cursor.pos + value),
  );
  cursor.pos += value;
  return result;
};

/**
 * Read a CBOR array header.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {number} - number of elements
 */
const cborReadArrayHeader = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_ARRAY) {
    throw new Error(`CBOR: expected array (major 4), got major ${major}`);
  }
  return value;
};

/**
 * Decode a CBOR frame (byte string) from raw bytes.
 * @param {Uint8Array} frameData
 * @returns {Uint8Array} - the inner content
 */
       const decodeFrame = frameData => {
  const cursor = makeCursor(frameData);
  return cborReadBytes(cursor);
};$h͏_once.decodeFrame(decodeFrame);
harden(decodeFrame);

/**
 * Decode an envelope from a CBOR 4-element array.
 * @param {Uint8Array} data
 * @returns {Envelope}
 */
       const decodeEnvelope = data => {
  const cursor = makeCursor(data);
  const n = cborReadArrayHeader(cursor);
  if (n !== 3 && n !== 4) {
    throw new Error(`Envelope: expected 3 or 4 elements, got ${n}`);
  }
  const handle = cborReadInt(cursor);
  const verb = cborReadText(cursor);
  const payload = cborReadBytes(cursor);
  const nonce = n === 4 ? cborReadInt(cursor) : 0;
  // Note: not hardened because payload is a Uint8Array, and
  // typed arrays cannot be frozen in XS (non-configurable indexed
  // properties). The envelope is a transient parsing result.
  return { handle, verb, payload, nonce };
};$h͏_once.decodeEnvelope(decodeEnvelope);
harden(decodeEnvelope);

// ---------------------------------------------------------------------------
// Streaming: read CBOR frames from a Node.js readable stream
// ---------------------------------------------------------------------------

/**
 * Read exactly `n` bytes from a Node.js readable stream.
 * @param {import('stream').Readable} stream
 * @param {number} n
 * @returns {Promise<Uint8Array | null>}
 */
const readExactly = (stream, n) => {
  return new Promise((resolve, reject) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    let remaining = n;

    const onReadable = () => {
      while (remaining > 0) {
        const chunk = stream.read(Math.min(remaining, stream.readableLength));
        if (chunk === null) {
          return; // Wait for more data
        }
        chunks.push(chunk);
        remaining -= chunk.length;
      }
      cleanup();
      resolve(new Uint8Array(Buffer.concat(chunks)));
    };

    const onEnd = () => {
      cleanup();
      if (remaining === n) {
        resolve(null); // Clean EOF
      } else {
        reject(new Error('CBOR: unexpected EOF in frame'));
      }
    };

    const onError = (/** @type {Error} */ err) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      stream.removeListener('readable', onReadable);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    };

    stream.on('readable', onReadable);
    stream.on('end', onEnd);
    stream.on('error', onError);

    // Try reading immediately in case data is already buffered.
    onReadable();
  });
};

/**
 * Read one CBOR byte-string frame from a Node.js readable stream.
 * Returns the inner content bytes, or null on EOF.
 * @param {import('stream').Readable} stream
 * @returns {Promise<Uint8Array | null>}
 */
       const readFrameFromStream = async stream => {
  // Read the CBOR byte-string header.
  const firstByte = await readExactly(stream, 1);
  if (firstByte === null) return null;

  const major = firstByte[0] >> 5;
  if (major !== CBOR_BYTES) {
    throw new Error(
      `CBOR frame: expected byte string (major 2), got major ${major}`,
    );
  }
  const info = firstByte[0] & 0x1f;

  let length;
  if (info < 24) {
    length = info;
  } else if (info === 24) {
    const b = await readExactly(stream, 1);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = b[0];
  } else if (info === 25) {
    const b = await readExactly(stream, 2);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = (b[0] << 8) | b[1];
  } else if (info === 26) {
    const b = await readExactly(stream, 4);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  } else {
    throw new Error(`CBOR frame: unsupported length info ${info}`);
  }

  if (length === 0) return new Uint8Array(0);

  const content = await readExactly(stream, length);
  if (content === null) {
    throw new Error('CBOR: unexpected EOF in frame content');
  }
  return content;
};$h͏_once.readFrameFromStream(readFrameFromStream);
harden(readFrameFromStream);

/**
 * Write a CBOR byte-string frame to a Node.js writable stream.
 * @param {import('stream').Writable} stream
 * @param {Uint8Array} data
 * @returns {Promise<void>}
 */
       const writeFrameToStream = (stream, data) => {
  const frame = encodeFrame(data);
  return new Promise((resolve, reject) => {
    stream.write(frame, err => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
};$h͏_once.writeFrameToStream(writeFrameToStream);
harden(writeFrameToStream);
})()
,
// === 87. daemon ./src/bus-xs-common.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// @ts-check
/* global globalThis */

/**
 * Shared primitives used by both XS bus bootstraps
 * (bus-worker-xs.js and bus-daemon-rust-xs.js).
 *
 * Intentionally tiny: only the bits that were duplicated verbatim in
 * both bootstraps.  The actual wire plumbing lives in bus-xs-core.js.
 */

       const textEncoder = new TextEncoder();$h͏_once.textEncoder(textEncoder);
harden(textEncoder);

       const textDecoder = new TextDecoder();$h͏_once.textDecoder(textDecoder);
harden(textDecoder);

/**
 * No-op rejection handler.  XS console.error may crash when formatting
 * certain error objects, so we swallow CapTP-internal rejections
 * silently.
 *
 * @param {unknown} _err
 */
       const silentReject = _err => {};$h͏_once.silentReject(silentReject);
harden(silentReject);

/**
 * Shared termination state for the XS main loop.  The Rust main loop
 * polls `globalThis.__shouldTerminate()` after each command; when it
 * returns true, Rust breaks out of its loop and the process exits.
 */
const terminationState = { shouldTerminate: false };

       const markShouldTerminate = () => {
  terminationState.shouldTerminate = true;
};$h͏_once.markShouldTerminate(markShouldTerminate);
harden(markShouldTerminate);

/**
 * Install `globalThis.__shouldTerminate` so the Rust main loop can
 * poll it.  Safe to call more than once; subsequent calls are no-ops.
 */
       const installShouldTerminate = () => {
  if (globalThis.__shouldTerminate === undefined) {
    globalThis.__shouldTerminate = harden(
      () => terminationState.shouldTerminate,
    );
  }
};$h͏_once.installShouldTerminate(installShouldTerminate);
harden(installShouldTerminate);
})()
,
// === 88. daemon ./src/bus-xs-core.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let encodeEnvelope,decodeEnvelope,installShouldTerminate,markShouldTerminate,silentReject,textDecoder,textEncoder;$h͏_imports([["./envelope.js", [["encodeEnvelope",[$h͏_a => (encodeEnvelope = $h͏_a)]],["decodeEnvelope",[$h͏_a => (decodeEnvelope = $h͏_a)]]]],["./bus-xs-common.js", [["installShouldTerminate",[$h͏_a => (installShouldTerminate = $h͏_a),$h͏_live["installShouldTerminate"]]],["markShouldTerminate",[$h͏_a => (markShouldTerminate = $h͏_a),$h͏_live["markShouldTerminate"]]],["silentReject",[$h͏_a => (silentReject = $h͏_a),$h͏_live["silentReject"]]],["textDecoder",[$h͏_a => (textDecoder = $h͏_a),$h͏_live["textDecoder"]]],["textEncoder",[$h͏_a => (textEncoder = $h͏_a),$h͏_live["textEncoder"]]]]]]);













































const EMPTY_PAYLOAD = new Uint8Array(0);

/**
 * @typedef {import('./envelope.js').Envelope} Envelope
 */

/**
 * @typedef {(payload: Uint8Array) => void} PayloadHandler
 */

/**
 * @typedef {object} XsNode
 * @property {(handle: number, verb: string, payload?: Uint8Array, nonce?: number) => void} sendEnvelope
 * @property {(handle: number, onPayload: PayloadHandler) => void} registerSession
 * @property {(handle: number) => void} closeSession
 * @property {(handle: number) => boolean} hasSession
 */

/**
 * Create the shared XS node plumbing and install
 * `globalThis.handleCommand`.
 *
 * @param {object} [options]
 * @param {(env: Envelope) => void} [options.onControl]
 *   Called for any envelope whose verb is not `deliver`, and for
 *   `deliver` envelopes whose handle has no registered session.
 * @returns {XsNode}
 */
       const makeXsNode = ({ onControl } = {}) => {
  installShouldTerminate();

  /** @type {Map<number, PayloadHandler>} */
  const sessions = new Map();

  /**
   * @param {number} handle
   * @param {string} verb
   * @param {Uint8Array} [payload]
   * @param {number} [nonce]
   */
  const sendEnvelope = (handle, verb, payload, nonce) => {
    const data = encodeEnvelope({
      handle,
      verb,
      payload: payload || EMPTY_PAYLOAD,
      nonce: nonce || 0,
    });
    hostSendRawFrame(data);
  };

  /**
   * @param {number} handle
   * @param {PayloadHandler} onPayload
   */
  const registerSession = (handle, onPayload) => {
    sessions.set(handle, onPayload);
  };

  /** @param {number} handle */
  const closeSession = handle => {
    sessions.delete(handle);
  };

  /** @param {number} handle */
  const hasSession = handle => sessions.has(handle);

  /**
   * Called by the Rust main loop for every inbound envelope.
   *
   * @param {Uint8Array} bytes - raw CBOR envelope bytes
   */
  globalThis.handleCommand = harden(bytes => {
    let env;
    try {
      env = decodeEnvelope(bytes);
    } catch (e) {
      hostTrace(
        `xs-core: failed to decode envelope: ${/** @type {Error} */ (e).message}`,
      );
      return;
    }

    if (env.verb === 'deliver') {
      const onPayload = sessions.get(env.handle);
      if (onPayload) {
        try {
          onPayload(env.payload);
        } catch (e) {
          hostTrace(
            `xs-core: session ${env.handle} dispatch error: ${/** @type {Error} */ (e).message}`,
          );
        }
        return;
      }
    }

    if (onControl) {
      try {
        onControl(env);
      } catch (e) {
        hostTrace(
          `xs-core: onControl error for verb ${env.verb}: ${/** @type {Error} */ (e).message}`,
        );
      }
      return;
    }

    if (env.verb !== 'deliver') {
      hostTrace(`xs-core: unhandled verb=${env.verb} handle=${env.handle}`);
    } else {
      hostTrace(`xs-core: deliver for unknown handle=${env.handle}`);
    }
  });

  return harden({
    sendEnvelope,
    registerSession,
    closeSession,
    hasSession,
  });
};$h͏_once.makeXsNode(makeXsNode);
harden(makeXsNode);
})()
,
// === 89. stream ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,E,makePromiseKit;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/eventual-send", [["E",[$h͏_a => (E = $h͏_a)]]]],["@endo/promise-kit", [["makePromiseKit",[$h͏_a => (makePromiseKit = $h͏_a)]]]]]);
















// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template T
 * @returns {import('./types.js').AsyncQueue<T>}
 */
       const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
    },
    get() {
      const promise = tailPromise.then(next => next.value);
      tailPromise = tailPromise.then(next => next.promise);
      return harden(promise);
    },
  };
};$h͏_once.makeQueue(makeQueue);
harden(makeQueue);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').AsyncSpring<IteratorResult<TRead, TReadReturn>>} acks
 * @param {import('./types.js').AsyncSink<IteratorResult<TWrite, TWriteReturn>>} data
 */
       const makeStream = (acks, data) => {
  const stream = harden({
    /**
     * @param {TWrite} value
     */
    next(value) {
      // Note the shallow freeze since value is not guaranteed to be freezable
      // (typed arrays are not).
      data.put(freeze({ value, done: false }));
      return acks.get();
    },
    /**
     * @param {TWriteReturn} value
     */
    return(value) {
      data.put(freeze({ value, done: true }));
      return acks.get();
    },
    /**
     * @param {Error} error
     */
    throw(error) {
      data.put(harden(Promise.reject(error)));
      return acks.get();
    },
    [Symbol.asyncIterator]() {
      return stream;
    },
  });
  return stream;
};$h͏_once.makeStream(makeStream);
harden(makeStream);

// JSDoc TypeScript seems unable to express this particular function's
// entanglement of queues, but the definition in types.d.ts works for the end
// user.
       const makePipe = () => {
  const data = makeQueue();
  const acks = makeQueue();
  const reader = makeStream(acks, data);
  const writer = makeStream(data, acks);
  return harden([writer, reader]);
};$h͏_once.makePipe(makePipe);
harden(makePipe);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').Stream<TWrite, TRead, TWriteReturn, TReadReturn>} writer
 * @param {import('./types.js').Stream<TRead, TWrite, TReadReturn, TWriteReturn>} reader
 * @param {TWrite} primer
 */
       const pump = async (writer, reader, primer) => {
  /** @param {Promise<IteratorResult<TRead, TReadReturn>>} promise */
  const tick = promise =>
    E.when(
      promise,
      result => {
        if (result.done) {
          return writer.return(result.value);
        } else {
          // Behold: mutual recursion.
          // eslint-disable-next-line no-use-before-define
          return tock(writer.next(result.value));
        }
      },
      (/** @type {Error} */ error) => {
        return writer.throw(error);
      },
    );
  /** @param {Promise<IteratorResult<TWrite, TWriteReturn>>} promise */
  const tock = promise =>
    E.when(
      promise,
      result => {
        if (result.done) {
          return reader.return(result.value);
        } else {
          return tick(reader.next(result.value));
        }
      },
      (/** @type {Error} */ error) => {
        return reader.throw(error);
      },
    );
  await tick(reader.next(primer));
  return undefined;
};$h͏_once.pump(pump);
harden(pump);

/**
 * @template TRead
 * @template TWrite
 * @template TReturn
 * @param {AsyncGenerator<TRead, TReturn, TWrite>} generator
 * @param {TWrite} primer
 */
       const prime = (generator, primer) => {
  // We capture the first returned promise.
  const first = generator.next(primer);
  /** @type {IteratorResult<TRead, TReturn>=} */
  let result;
  const primed = harden({
    /** @param {TWrite} value */
    async next(value) {
      if (result === undefined) {
        // eslint-disable-next-line @jessie.js/safe-await-separator
        result = await first;
        if (result.done) {
          return result;
        }
      }
      return generator.next(value);
    },
    /** @param {TReturn} value */
    async return(value) {
      if (result === undefined) {
        // eslint-disable-next-line @jessie.js/safe-await-separator
        result = await first;
        if (result.done) {
          return result;
        }
      }
      return generator.return(value);
    },
    /** @param {Error} error */
    async throw(error) {
      if (result === undefined) {
        // eslint-disable-next-line @jessie.js/safe-await-separator
        result = await first;
        if (result.done) {
          throw error;
        }
      }
      return generator.throw(error);
    },
  });
  return primed;
};$h͏_once.prime(prime);
harden(prime);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Reader<TIn>} reader
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Reader<TOut>}
 */
       const mapReader = (reader, transform) => {
  async function* transformGenerator() {
    for await (const value of reader) {
      yield transform(value);
    }
    return undefined;
  }
  harden(transformGenerator);
  return harden(transformGenerator());
};$h͏_once.mapReader(mapReader);
harden(mapReader);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Writer<TOut>} writer
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Writer<TIn>}
 */
       const mapWriter = (writer, transform) => {
  const transformedWriter = harden({
    /**
     * @param {TIn} value
     */
    async next(value) {
      return writer.next(transform(value));
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      return writer.throw(error);
    },
    /**
     * @param {undefined} value
     */
    async return(value) {
      return writer.return(value);
    },
    [Symbol.asyncIterator]() {
      return transformedWriter;
    },
  });
  return transformedWriter;
};$h͏_once.mapWriter(mapWriter);
harden(mapWriter);
})()
,
// === 90. daemon ./src/ref-reader.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,decodeBase64,mapReader,E;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/base64", [["decodeBase64",[$h͏_a => (decodeBase64 = $h͏_a)]]]],["@endo/stream", [["mapReader",[$h͏_a => (mapReader = $h͏_a)]]]],["@endo/far", [["E",[$h͏_a => (E = $h͏_a)]]]]]);






/**
 * @template TValue
 * @template TReturn
 * @template TNext
 * @param {import('@endo/far').ERef<AsyncIterator<TValue, TReturn, TNext>>} iteratorRef
 */
       const makeRefIterator = iteratorRef => {
  const iterator = harden({
    /** @param {[] | [TNext]} args */
    next: async (...args) => E(iteratorRef).next(...args),
    /** @param {[] | [TReturn]} args */
    return: async (...args) => E(iteratorRef).return(...args),
    /** @param {any} error */
    throw: async error => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  });
  return iterator;
};$h͏_once.makeRefIterator(makeRefIterator);
harden(makeRefIterator);

/**
 * @param {import('@endo/far').ERef<AsyncIterator<string>>} readerRef
 * @returns {AsyncIterableIterator<Uint8Array>}
 */
       const makeRefReader = readerRef =>
  mapReader(makeRefIterator(readerRef), decodeBase64);$h͏_once.makeRefReader(makeRefReader);
})()
,
// === 91. daemon ./src/bus-worker-xs.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let makeCapTP,E,Far,makeExo,M,decodeBase64,makeXsNode,markShouldTerminate,silentReject,textDecoder,textEncoder,makeRefIterator;$h͏_imports([["@endo/captp", [["makeCapTP",[$h͏_a => (makeCapTP = $h͏_a)]]]],["@endo/far", [["E",[$h͏_a => (E = $h͏_a)]],["Far",[$h͏_a => (Far = $h͏_a)]]]],["@endo/exo", [["makeExo",[$h͏_a => (makeExo = $h͏_a)]]]],["@endo/patterns", [["M",[$h͏_a => (M = $h͏_a)]]]],["@endo/base64", [["decodeBase64",[$h͏_a => (decodeBase64 = $h͏_a)]]]],["./bus-xs-core.js", [["makeXsNode",[$h͏_a => (makeXsNode = $h͏_a)]],["markShouldTerminate",[$h͏_a => (markShouldTerminate = $h͏_a)]],["silentReject",[$h͏_a => (silentReject = $h͏_a)]],["textDecoder",[$h͏_a => (textDecoder = $h͏_a)]],["textEncoder",[$h͏_a => (textEncoder = $h͏_a)]]]],["./ref-reader.js", [["makeRefIterator",[$h͏_a => (makeRefIterator = $h͏_a)]]]]]);





































// Console polyfill: marshal.js's default marshalSaveError calls
// `console.log('Temporary logging of sent error', err)` while
// serializing rejected errors. Without a global `console`, the call
// throws "get console: undefined variable" inside captp's processResult,
// which silently swallows the rejection and hangs the eval round-trip.
if (typeof globalThis.console === 'undefined') {
  const makeLogFn = prefix => (...args) => {
    const parts = args.map(a => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object' && typeof a.message === 'string') {
        return `${a.name || 'Error'}: ${a.message}`;
      }
      try { return JSON.stringify(a); } catch { return String(a); }
    });
    try { hostTrace(`${prefix}${parts.join(' ')}`); } catch (_e) {}
  };
  globalThis.console = {
    log: makeLogFn(''),
    warn: makeLogFn('[warn] '),
    error: makeLogFn('[error] '),
    info: makeLogFn('[info] '),
    debug: makeLogFn('[debug] '),
    trace: makeLogFn('[trace] '),
  };
}

const node = makeXsNode();

const daemonHandle = hostGetDaemonHandle();

/** Standard endowments provided to evaluated code in Compartments. */
const standardEndowments = harden(
  Object.fromEntries(
    Object.entries({
      assert: globalThis.assert,
      console: globalThis.console,
      E,
      Far,
      makeExo,
      M,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      URL: globalThis.URL,
    }).filter(([_k, v]) => v !== undefined),
  ),
);

// XS worker facet — implements the worker side of CapTP
const workerFacet = makeExo(
  'EndoXsWorkerFacet',
  M.interface('EndoXsWorkerFacet', {
    terminate: M.call().returns(M.promise()),
    evaluate: M.call(
      M.string(),
      M.arrayOf(M.string()),
      M.arrayOf(M.any()),
      M.string(),
      M.promise(),
    ).returns(M.promise()),
    makeBundle: M.call(M.any(), M.any(), M.any(), M.any()).returns(
      M.promise(),
    ),
    makeArchive: M.call(M.any(), M.any(), M.any(), M.any()).returns(
      M.promise(),
    ),
    makeUnconfined: M.call(M.string(), M.any(), M.any(), M.any()).returns(
      M.promise(),
    ),
  }),
  {
    /** @returns {Promise<void>} */
    terminate: async () => {
      markShouldTerminate();
    },

    /**
     * Evaluate JavaScript source code with the given endowments.
     *
     * @param {string} source
     * @param {string[]} codeNames
     * @param {unknown[]} endowmentValues
     * @param {string} id
     * @param {Promise<never>} cancelled
     * @returns {Promise<unknown>}
     */
    evaluate: async (source, codeNames, endowmentValues, id, cancelled) => {
      const endowments = harden(
        Object.fromEntries(
          codeNames.map((name, index) => [name, endowmentValues[index]]),
        ),
      );
      const globals = harden({
        ...standardEndowments,
        ...endowments,
        $id: id,
        $cancelled: cancelled,
      });
      // XS native Compartment uses globalThis assignment;
      // SES shimmed Compartment takes endowments as first arg.
      // Try SES-style first, fall back to XS-style.
      const compartment = new Compartment(globals);
      // If endowments didn't stick via constructor, set them on
      // globalThis directly (XS native Compartment path).
      for (const [name, value] of Object.entries(globals)) {
        if (!(name in compartment.globalThis)) {
          compartment.globalThis[name] = value;
        }
      }
      return compartment.evaluate(source);
    },

    /**
     * @param {unknown} _readableP
     * @param {unknown} _powersP
     * @param {unknown} _contextP
     * @param {Record<string, string>} _env
     * @returns {Promise<unknown>}
     */
    makeBundle: async (_readableP, _powersP, _contextP, _env) => {
      throw new Error('makeBundle not yet implemented in XS worker');
    },

    /**
     * @param {unknown} readableP
     * @param {unknown} powersP
     * @param {unknown} contextP
     * @param {Record<string, string>} env
     * @returns {Promise<unknown>}
     */
    makeArchive: async (readableP, powersP, contextP, env) => {
      // Stream base64 chunks from the readable blob via CapTP
      const streamRef = await E(readableP).streamBase64();
      const chunks = [];
      for await (const chunk of makeRefIterator(streamRef)) {
        chunks.push(decodeBase64(chunk));
      }
      const totalLen = chunks.reduce((n, c) => n + c.length, 0);
      const archiveBytes = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        archiveBytes.set(c, offset);
        offset += c.length;
      }

      // Load archive natively via Rust host function (Uint8Array)
      const ok = hostImportArchive(archiveBytes);
      if (!ok) throw new Error('Failed to import archive');

      // Entry namespace set by install_archive — capture and release.
      const namespace = globalThis.__entryNs;
      delete globalThis.__entryNs;
      return namespace.make(powersP, contextP, { env });
    },

    /**
     * @param {string} _specifier
     * @param {unknown} _powersP
     * @param {unknown} _contextP
     * @param {Record<string, string>} _env
     * @returns {Promise<unknown>}
     */
    makeUnconfined: async (_specifier, _powersP, _contextP, _env) => {
      throw new Error('makeUnconfined not yet implemented in XS worker');
    },
  },
);

// ---------------------------------------------------------------------------
// Single CapTP session on the daemon handle
// ---------------------------------------------------------------------------

/**
 * Outbound CapTP send: JSON-encode the message and wrap it in a
 * `deliver` envelope addressed to the daemon handle.
 *
 * @param {Record<string, unknown>} message
 */
const send = message => {
  const json = JSON.stringify(message);
  node.sendEnvelope(daemonHandle, 'deliver', textEncoder.encode(json));
};

const { dispatch } = makeCapTP('Endo', send, workerFacet, {
  onReject: silentReject,
});

node.registerSession(daemonHandle, payload => {
  const json = textDecoder.decode(payload);
  let message;
  try {
    message = JSON.parse(json);
  } catch {
    return;
  }
  try {
    dispatch(message);
  } catch {
    // Swallow — handled by onReject.
  }
});
})()
,
])()