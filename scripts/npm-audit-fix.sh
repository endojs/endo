git clone https://github.com/AgoricBot/nat.git
cd nat

if npm audit ; then
    echo "Nothing to fix"
else
    git config user.email "kate+agoricbot@agoric.com"
    git config user.name "AgoricBot"
    git checkout -b npm-audit-fix
    npm audit fix
    git add . 
    git commit -m "results of running npm audit fix"
    git remote set-url origin https://AgoricBot:$GITHUB_TOKEN@github.com/AgoricBot/nat.git
    git push origin npm-audit-fix
    hub pull-request --no-edit --base Agoric/nat:master
fi

# Do the same thing with the package.json in the integration-test folder
cd integration-test
if npm audit ; then
    echo "Nothing to fix"
else
    git config user.email "kate+agoricbot@agoric.com"
    git config user.name "AgoricBot"
    git checkout -b npm-audit-fix
    npm audit fix
    git add . 
    git commit -m "results of running npm audit fix"
    git remote set-url origin https://AgoricBot:$GITHUB_TOKEN@github.com/AgoricBot/nat.git
    git push origin npm-audit-fix
    hub pull-request --no-edit --base Agoric/nat:master
fi
