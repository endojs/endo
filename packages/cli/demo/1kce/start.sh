#!/bin/bash
set -e

./demo/1kce/addCards.sh
yarn endo open gamelet ./demo/1kce/weblet.js --powers SELF