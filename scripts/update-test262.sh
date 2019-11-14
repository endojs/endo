#!/bin/sh

# command path is not set on MacOS for security
LS=/bin/ls
GREP=/usr/bin/grep
CPIO=/usr/bin/cpio
FIND=/usr/bin/find
WC=/usr/bin/wc
GIT=/usr/local/bin/git

display_usage() { 
  echo "This updates the test262 test files." 
  echo "Given a clone of the test262 git repo, it copies all tests"
  echo "that validate conformance to TC39 module specifications."
  echo "\nUsage:\nupdate-test262 <path-to-test262-git-clone>\n" 
  } 

# was command help requested?
if [[ ( $# == "--help") ||  $# == "-h" ]]
  then 
    display_usage
    exit 0
  fi 

# was argument provided?
PATH="$1" 
if [ -z "$PATH" ]
  then
    display_usage
    exit 1
  fi

# check wheter we have the signature of a root test262 repo
if [[ (! -e "$PATH"/README.md ) || (! -e "$PATH"/package.json) || (! -d "$PATH"/test ) || (! -d "$PATH"/harness ) ]]
  then
    echo "Path provided not a test262 git clone."
    exit 1
  fi

# check wheter we have signature of a root target repo
if [[ (! -e README.md ) || (! -e package.json) || (! -d test262/test ) || (! -e test262/test262-revision.txt)]]
  then
    echo "Must execute from the root of the target repo."
    echo "Make sure test262/test exits and that it's an empty directory."
    exit 1
  fi

# Ask to remove all files manually
if [ "$($LS -A test262/test)" ] 
  then
    echo "Directory test262/test must be manually emptied first."
    echo "Use 'trash test262/test/*' or similar."
    exit 1
  fi

# find all files matching `flags: [ module ]`
# copy archives in copy-pass mode, make directories, preserve modification time 
echo "copying files..."
$GREP -lr 'flags:\s*\[[^]]*module[^[]*]' "$PATH"/test | $CPIO -pdm --quiet test262
# ensure module fixtures are also copied
$FIND ../test262/test/language/module-code -name *.js | $CPIO -pdm --quiet test262
$FIND ../test262/test/language/expressions/dynamic-import -name *.js | $CPIO -pdm --quiet test262
COUNT=`$FIND test262/test -name *.js | $WC -l`
echo "$COUNT files copied."

# update the revision
ORIGIN=`(cd "$PATH"; $GIT config --get remote.origin.url)`
REVISION=`(cd "$PATH"; $GIT rev-parse HEAD)`;
echo "test262 remote url: $ORIGIN\ntest262 revision: $REVISION" > test262/test262-revision.txt
echo "test262/test262-revision.txt updated."

