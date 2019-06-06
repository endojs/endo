set -e
git clone https://github.com/AgoricBot/SES.git
cd SES
git remote add upstream https://github.com/Agoric/SES.git
git remote set-url origin https://AgoricBot:$GITHUB_TOKEN@github.com/AgoricBot/SES.git
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

for dir in . integration-test; do
  if (cd "$dir" && npm audit) ; then
    echo "Nothing to fix in $dir"
  else
    (cd "$dir" && npm audit fix)
    files_changed=true
  fi
done

if [ "$files_changed" = true ] ; then
  git add . 
  git commit -m "results of running npm audit fix"
  git push origin npm-audit-fix
  hub pull-request --no-edit --base Agoric/SES:master
fi
