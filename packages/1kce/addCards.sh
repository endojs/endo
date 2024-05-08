#!/bin/bash
set -e

cd ./src/cards

for file in *.js
do
filename=$(basename -- "$file")
extension="${filename##*.}"
filename="${filename%.*}"
  yarn endo make "src/cards/$file" -n "card-$filename"
  if [ $? -ne 0 ]; then
    exit 1
  fi
done
