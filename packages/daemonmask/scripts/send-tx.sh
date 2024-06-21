#!/bin/bash

set -e
set -u
set -o pipefail

endo eval 'E(wallet).request("eth_sendTransaction", [{
  from: "0xc6D5a3c98EC9073B54FA0969957Bd582e8D874bf",
  to: "0x59A897A2dbd55D20bCC9B52d5eaA14E2859Dc467",
  value: "0xde0b6b3a7640000",
  gasLimit: "0x5208",
  gasPrice: "0x2540be400",
  type: "0x0",
}])' wallet
