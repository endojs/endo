# Intrinsics Global

The global intrinsics are the root named intrinsics (intrinsics that are direct properties of the global object).

## API

```
getGlobalIntrinsics(): Object
```

 Return a record-like object similar to the [[intrinsics]] slot of the realmRec in the ES specifications except for the following simpifications:
 - we only returns the intrinsics that correspond to the global object properties listed in 18.2, 18.3, or 18.4 of ES specifications.
 - we use the name of the associated global object property instead of the intrinsic name (usually, `<intrinsic name> === '%' + <global property name>+ '%'`).

## Assumptions

The intrinsic names correspond to the object names with "%" added as prefix and suffix, i.e. the intrinsic "%Object%" is equal to the global object property "Object".
