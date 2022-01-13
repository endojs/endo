git clone https://github.com/AgoricBot/nat.git
cd nat
git remote add upstream https://github.com/Agoric/nat.git
git remote set-url origin https://AgoricBot:$GITHUB_TOKEN@github.com/AgoricBot/nat.git
git fetch upstream
git checkout master
git rebase upstream/master
git config user.email "kate+agoricbot@agoric.com"
git config user.name "AgoricBot"
git config --global hub.protocol https
hub push origin master

if git ls-remote --heads --exit-code origin npm-audit-fix ; then
  git push --delete origin npm-audit-fix
fi

git checkout -b npm-audit-fix

if npm audit ; then
    echo "Nothing to fix"
else
  npm audit fix
  files_changed=true
fi

# Do the same thing with the package.json in the integration-test folder
cd integration-test
if npm audit ; then
    echo "Nothing to fix"
else
  npm audit fix
  files_changed=true
fi
cd ..

if [ "$files_changed" = true ] ; then
  git add . 
  git commit -m "results of running npm audit fix"
  git push origin npm-audit-fix
  hub pull-request --no-edit --base Agoric/nat:master
fi
