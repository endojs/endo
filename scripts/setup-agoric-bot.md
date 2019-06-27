# AgoricBot

AgoricBot is a github user that we've created to automatically create
Pull Requests for anything that can be automatically fixed as a result
of npm audit. 

# Setting up AgoricBot

1. Sign in as AgoricBot on Github (see Kate for the password)
2. Go to the github page for the Agoric repo that you have just
   created
3. Fork the repo as AgoricBot
4. Change npm-audit-fix.sh (in this folder) to use this forked repo
   and the actual Agoric repo instead of the '???' fillers
5. On CircleCI (see setup-circleci.md in the root directory for more),
   go to your project's settings and look for 'Environmental
   Variables' under Build Settings
6. Import the environmental variable from another repo, like SES. The
   variable should be named GITHUB_TOKEN and have a value that ends
   with "c166". (Note that the UI may not change once you have
   imported until you reload the page.)
   
