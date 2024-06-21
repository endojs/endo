#!/bin/bash

set -e
set -u
set -o pipefail
set -x  # Print each command before execution

endo purge -f
endo start

endo make --UNCONFINED src/caplets/keyring.js --name keyring
endo eval 'E(keyring).init(
  "test test test test test test test test test test test ball"
)' keyring
endo eval 'E(keyring).getAddress()' keyring --name address

endo eval 'E(keyring).signMessage("0xdeadbeef")' keyring
endo eval 'E(keyring).signTransaction({
  from: address,
  to: "0x0c54FcCd2e384b4BB6f2E405Bf5Cbc15a017AaFb",
  value: "0x0",
  gasLimit: "0x5028",
  maxFeePerGas: "0x2540be400",
  maxPriorityFeePerGas: "0x3b9aca00",
})' keyring address
