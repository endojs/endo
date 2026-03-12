#!/usr/bin/env bash

set -x
set -e

systemd-run --user \
  --slice background.slice \
  --unit evoke \
  --service-type=exec \
  --property=Type=exec \
  --send-sighup \
  --collect \
  "$HOME/endo/evoke.sh"
