#!/bin/bash -e

git init new-monorepo
cd new-monorepo

P="SES evaluate evaluator-shim harden make-hardener make-importer transform-module"
#P="marshal agoric-sdk"
for i in $P; do
    git remote add $i https://github.com/Agoric/$i
done


git commit --allow-empty -m "empty commit"

# now we want to take each package and move it into a separate subdirectory
for remote in $P; do
    git remote update $remote
    # the tags will collide horribly, so just delete them all
    for tag in `git tag`; do
        git tag -d $tag
    done
    git checkout $remote/master
    mkdir NEW-SUBDIR-TEMPXXX
    echo mv `ls -a |grep -v '^\.git$' |grep -v '^\.$' |grep -v '^\.\.$' |grep -v NEW-SUBDIR-TEMPXXX` NEW-SUBDIR-TEMPXXX/
    mv `ls -a |grep -v '^\.git$' |grep -v '^\.$' |grep -v '^\.\.$' |grep -v NEW-SUBDIR-TEMPXXX` NEW-SUBDIR-TEMPXXX/
    mv NEW-SUBDIR-TEMPXXX $remote
    git add -A .
    git commit -m "move $remote into a subdirectory"
    git branch moved-$remote
    git checkout master
    if [ -z "$(git status --porcelain)" ]; then
        echo "good, clean"
    else
        echo "oops, uncommitted changes"
        exit 1
    fi
done

# now we want to make a single big merge commit, with every moved-$i tag as a
# parent. This looks like a conflict, even though there are no overlapping
# files, which we must overcome.
git checkout master

git merge --allow-unrelated-histories --no-commit `for i in $P; do echo moved-$i; done` || /usr/bin/true

HEAD=HEAD
for i in $P; do
    git read-tree `git write-tree` moved-$i
    git branch -D moved-$i
done
git checkout-index -fua
git commit -m "merge moved projects"

# now reproduce/rename tags from the original repos. I don't know how to do
# this in bash.

python3 ../make-monorepo-tags.py $P
