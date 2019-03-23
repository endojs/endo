git clone https://github.com/AgoricBot/nat.git
cd nat
git remote add upstream https://github.com/Agoric/nat.git
git fetch upstream
git checkout master
git rebase upstream/master
git config user.email "kate+agoricbot@agoric.com"
git config user.name "AgoricBot"
hub push origin master
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
  git remote set-url origin https://AgoricBot:$GITHUB_TOKEN@github.com/AgoricBot/nat.git
  git push origin npm-audit-fix
  hub pull-request --no-edit --base Agoric/nat:master
fi
