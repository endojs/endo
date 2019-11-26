# Burn after reading

This file contains instructions for setting up a project based on new-repo.

After you have completed these instructions, you should do `git rm SETUP-DELETEME.md`

# Cloning the new-repo repository

Clone it as:

```
$ git clone https://github.com/Agoric/new-repo MyPackageName
$ cd MyPackageName
$ git remote rename origin new-repo
```

## Create Agoric/MyPackageName on GitHub

After creating Agoric/MyPackageName, you should run something like:

```
$ git remote add origin git@github.com:Agoric/MyPackageName
$ git push -u origin master
```

# Setting up package.json

The package.json is already set up with organization-prefixed details.  You just need to substitute
your package name (usually dash-separated) and your repository name (usually capitalized words
concatenated):

1. `sed -i.bak -e 's/@PACKAGE@/my-package-name/g; s/@REPO@/MyPackageName/g' package.json`
2. `rm package.json.bak`

# Setting up README.md

You will definitely want to edit the `README.md` file, then begin committing and pushing as usual.

# Setting up CircleCI

1. Go to https://circleci.com/gh/Agoric
2. Click the "Add Project" button to the left
3. Make sure that your repo has the `.circleci/config.yml` file that new-repo has
