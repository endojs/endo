#!/bin/bash
set -e

cd /home/xyz/Development/endo/packages/cli/demo/cards

for file in *.js
do
filename=$(basename -- "$file")
extension="${filename##*.}"
filename="${filename%.*}"
  yarn endo make "demo/cards/$file" -n "card-$filename"
  if [ $? -ne 0 ]; then
    exit 1
  fi
done
