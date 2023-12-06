endo reset

endo mkguest alice
endo mkguest bob

(cd ../1kce/ && src/start.sh)

# demo ux hack
# premake guest-deck and send it alice so it can receive messages from her
endo mkguest guest-deck
endo send guest-deck @alice
endo adopt 0 alice --as guest-deck

endo open familiar-chat ./index.js --powers SELF
