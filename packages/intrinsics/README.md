# Intrinsics

The intrinsics are the defiend in the global specifications.

## API

```
getIntrinsics(): Object
```

Operation similar to abstract operation `CreateInrinsics` in section 8.2.2 of the ES specifications.

Return a record-like object similar to the [[intrinsics]] slot of the realmRec excepts for the following simpifications:
 - we omit the intrinsics not reachable by JavaScript code.
 - we omit intrinsics that are direct properties of the global object (except for the
   "prototype" property), and properties that are direct properties of the prototypes
   (except for "constructor").
 - we use the name of the associated global object property instead of the intrinsic name (usually, `<intrinsic name> === '%' + <global property name>+ '%'`).

## Assumptions

The intrinsic names correspond to the object names with "%" added as prefix and suffix, i.e. the intrinsic "%Object%" is equal to the global object property "Object".
