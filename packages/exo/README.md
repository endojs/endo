# `@endo/exo`

An Exo object is an exposed Remotable object with methods (aka a Far object) which is normally defined with an InterfaceGuard as a protective outer layer, providing the first layer of defensiveness.

This `@endo/exo` package defines the APIs for making Exo objects, and for defining ExoClasses and ExoClassKits for making Exo objects.

See [exo-taxonomy](./docs/exo-taxonomy.md) for the taxonomy and naming conventions for the elements of this API.

When an exo is defined with an InterfaceGuard, the exo is augmented by default with a meta-method for obtaining the self-describing InterfaceGuard from the exo:

```js
// `GET_INTERFACE_GUARD` holds the name of the meta-method
import { GET_INTERFACE_GUARD } from '@endo/exo';
import { getInterfaceMethodKeys } from '@endo/patterns';

...
   const interfaceGuard = await E(exo)[GET_INTERFACE_GUARD]();
   // `methodNames` omits names of automatically added meta-methods like
   // the value of `GET_INTERFACE_GUARD`.
   // Others may also be omitted if allowed by interfaceGuard options
   const methodNames = getInterfaceMethodKeys(interfaceGuard);
...
```
